#include <esp_attr.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

#include <math.h>

#include "AccessControl.h"
#include "Config.h"
#include "ControlLogic.h"
#include "Display.h"
#include "Hardware.h"
#include "SerialProtocol.h"
#include "SystemModel.h"

namespace smartegg {

namespace {

SystemState sharedState = {
    0.0F, 0.0F, false, false, true, false, 0, 0, false, false, false, 0,
};

RuntimeConfig sharedRuntimeConfig = {
    config::kDefaultTemperatureMinC,
    config::kDefaultTemperatureMaxC,
    config::kDefaultHumidityMinPct,
    config::kDefaultHumidityMaxPct,
    config::kDefaultRotationIntervalMs,
    config::kDefaultRotationAngleDegrees,
};

ManualOverrides manualOverrides = {-1, -1, -1};
ControlCommand pendingCommand = {CommandType::kNone, 0, false};
bool pendingCommandReady = false;
MessageType pendingMessageType = MessageType::kEvent;
uint8_t pendingMessageCode = static_cast<uint8_t>(EventCode::kBoot);
bool pendingMessageReady = true;
TaskHandle_t sensorControlTaskHandle = nullptr;
TaskHandle_t communicationTaskHandle = nullptr;
portMUX_TYPE sharedDataMux = portMUX_INITIALIZER_UNLOCKED;

void copyState(SystemState& output) {
  portENTER_CRITICAL(&sharedDataMux);
  output = sharedState;
  portEXIT_CRITICAL(&sharedDataMux);
}

void storeState(const SystemState& input) {
  portENTER_CRITICAL(&sharedDataMux);
  sharedState = input;
  portEXIT_CRITICAL(&sharedDataMux);
}

RuntimeConfig copyRuntimeConfig() {
  RuntimeConfig output;
  portENTER_CRITICAL(&sharedDataMux);
  output = sharedRuntimeConfig;
  portEXIT_CRITICAL(&sharedDataMux);
  return output;
}

bool takePendingCommand(ControlCommand& output) {
  bool available = false;
  portENTER_CRITICAL(&sharedDataMux);
  if (pendingCommandReady) {
    output = pendingCommand;
    pendingCommandReady = false;
    available = true;
  }
  portEXIT_CRITICAL(&sharedDataMux);
  return available;
}

bool takePendingMessage(MessageType& type, uint8_t& code) {
  bool available = false;
  portENTER_CRITICAL(&sharedDataMux);
  if (pendingMessageReady) {
    type = pendingMessageType;
    code = pendingMessageCode;
    pendingMessageReady = false;
    available = true;
  }
  portEXIT_CRITICAL(&sharedDataMux);
  return available;
}

void applyManualCommand(const ControlCommand& command,
                        SystemState& state,
                        TickType_t now,
                        TickType_t& lastRotationTick) {
  if (!state.systemEnabled) {
    postProtocolMessage(
        MessageType::kError,
        static_cast<uint8_t>(ErrorCode::kSystemDisabled));
    return;
  }
  if (command.type == CommandType::kRotate) {
    const RuntimeConfig runtimeConfig = copyRuntimeConfig();
    const int8_t angle = clampRotationAngle(command.value, runtimeConfig);
    setTrayAngle(angle);
    state.servoAngleDegrees = angle;
    lastRotationTick = now;
    postProtocolMessage(MessageType::kEvent,
                        static_cast<uint8_t>(EventCode::kRotation));
    return;
  }

  const int8_t overrideValue = command.automatic ? -1 : command.value;
  if (command.type == CommandType::kHeater) {
    manualOverrides.heater = overrideValue;
  } else if (command.type == CommandType::kFan) {
    manualOverrides.fan = overrideValue;
  } else if (command.type == CommandType::kBuzzer) {
    manualOverrides.buzzer = overrideValue;
  }
  postProtocolMessage(MessageType::kEvent,
                      static_cast<uint8_t>(EventCode::kActuatorCommand));
}

void processPowerSwitch(SystemState& state,
                        TickType_t now,
                        TickType_t& lastRotationTick,
                        TickType_t& lastSwitchInterruptTick,
                        bool& pendingSwitchEnabled,
                        bool& debouncePending) {
  bool requestedOn = pendingSwitchEnabled;
  const bool interrupted = ulTaskNotifyTake(pdTRUE, 0) > 0 &&
                           takePowerSwitchRequest(requestedOn);
  if (interrupted) {
    pendingSwitchEnabled = requestedOn;
    lastSwitchInterruptTick = now;
    debouncePending = true;
    return;
  }
  if (!debouncePending ||
      static_cast<TickType_t>(now - lastSwitchInterruptTick) <
          pdMS_TO_TICKS(config::kPowerSwitchDebounceMs)) {
    return;
  }

  debouncePending = false;
  // One confirmation after the ISR debounce is not periodic polling.
  if (isPowerSwitchOn() != pendingSwitchEnabled ||
      pendingSwitchEnabled == state.systemEnabled) {
    return;
  }
  state.systemEnabled = pendingSwitchEnabled;
  lastRotationTick = now;
  if (!state.systemEnabled) {
    state.servoAngleDegrees = 0;
    manualOverrides = {-1, -1, -1};
    setTrayAngle(0);
  }
  postProtocolMessage(
      MessageType::kEvent,
      static_cast<uint8_t>(state.systemEnabled ? EventCode::kPowerOn
                                               : EventCode::kPowerOff));
}

void processDoorInterrupt(SystemState& state) {
  if (!takeDoorInterrupt()) {
    return;
  }

  const bool doorOpen = isDoorOpen();
  if (doorOpen != state.doorOpen) {
    state.doorOpen = doorOpen;
    postProtocolMessage(
        MessageType::kEvent,
        static_cast<uint8_t>(doorOpen ? EventCode::kDoorOpen
                                      : EventCode::kDoorClosed));
  }
}

void sampleDht(SystemState& state) {
  float temperature = 0.0F;
  float humidity = 0.0F;
  if (!readDht(temperature, humidity) || isnan(humidity) ||
      isnan(temperature)) {
    if (state.consecutiveDhtFailures < UINT8_MAX) {
      ++state.consecutiveDhtFailures;
    }
    if (state.consecutiveDhtFailures >=
        config::kMaxConsecutiveDhtFailures) {
      const bool wasHealthy = state.sensorOk;
      state.sensorOk = false;
      if (wasHealthy ||
          state.consecutiveDhtFailures ==
              config::kMaxConsecutiveDhtFailures) {
        postProtocolMessage(
            MessageType::kError,
            static_cast<uint8_t>(ErrorCode::kDhtReadFailed));
      }
    }
    return;
  }

  const bool recovered = state.hasValidReading && !state.sensorOk;
  state.temperatureC = temperature;
  state.humidityPct = humidity;
  state.hasValidReading = true;
  state.sensorOk = true;
  state.consecutiveDhtFailures = 0;
  if (recovered) {
    postProtocolMessage(MessageType::kEvent,
                        static_cast<uint8_t>(EventCode::kDhtRecovered));
  }
}

void applyAutomaticControl(SystemState& state) {
  const RuntimeConfig runtimeConfig = copyRuntimeConfig();
  const ActuatorDecision previous = {
      state.heaterOn,
      state.fanOn,
      state.buzzerOn,
  };
  const ActuatorDecision next = evaluateActuators(
      state, runtimeConfig, manualOverrides, previous);
  const bool changed = next.heaterOn != state.heaterOn ||
                       next.fanOn != state.fanOn ||
                       next.buzzerOn != state.buzzerOn;
  if (changed) {
    state.heaterOn = next.heaterOn;
    state.fanOn = next.fanOn;
    state.buzzerOn = next.buzzerOn;
    setHeater(state.heaterOn);
    setFan(state.fanOn);
    setBuzzer(state.buzzerOn);
    postProtocolMessage(MessageType::kState, 0);
  }
  setStatusLed(state.systemEnabled && state.sensorOk);
}

void processPeriodicRotation(SystemState& state,
                             TickType_t now,
                             TickType_t& lastRotationTick,
                             int8_t& rotationDirection) {
  if (!state.systemEnabled) {
    lastRotationTick = now;
    return;
  }
  const RuntimeConfig runtimeConfig = copyRuntimeConfig();
  const TickType_t rotationTicks =
      pdMS_TO_TICKS(runtimeConfig.rotationIntervalMs);
  if (static_cast<TickType_t>(now - lastRotationTick) < rotationTicks) {
    return;
  }

  const int8_t angle = static_cast<int8_t>(
      rotationDirection * runtimeConfig.rotationAngleDegrees);
  rotationDirection = static_cast<int8_t>(-rotationDirection);
  setTrayAngle(angle);
  state.servoAngleDegrees = angle;
  lastRotationTick = now;
  postProtocolMessage(MessageType::kEvent,
                      static_cast<uint8_t>(EventCode::kRotation));
}

void sensorControlTask(void* parameters) {
  (void)parameters;
  TickType_t lastWakeTick = xTaskGetTickCount();
  TickType_t lastDhtTick =
      lastWakeTick - pdMS_TO_TICKS(config::kDhtSamplePeriodMs);
  TickType_t lastSlotTick =
      lastWakeTick - pdMS_TO_TICKS(config::kSlotSamplePeriodMs);
  TickType_t lastRotationTick = lastWakeTick;
  TickType_t lastDisplayTick =
      lastWakeTick - pdMS_TO_TICKS(config::kDisplayFramePeriodMs);
  TickType_t lastSwitchInterruptTick = lastWakeTick;
  int8_t rotationDirection = 1;
  uint8_t observedSlots = countOccupiedSlots();
  uint8_t stableSlotSamples = 0;
  bool pendingSwitchEnabled = isPowerSwitchOn();
  bool powerSwitchDebouncePending = false;

  SystemState state;
  copyState(state);
  state.systemEnabled = isPowerSwitchOn();
  state.doorOpen = isDoorOpen();
  state.occupiedSlots = countOccupiedSlots();
  if (!state.systemEnabled) {
    state.servoAngleDegrees = 0;
    setTrayAngle(0);
  }
  storeState(state);

  for (;;) {
    const TickType_t now = xTaskGetTickCount();
    copyState(state);

    processPowerSwitch(state, now, lastRotationTick,
                       lastSwitchInterruptTick, pendingSwitchEnabled,
                       powerSwitchDebouncePending);
    processDoorInterrupt(state);

    ControlCommand command;
    if (takePendingCommand(command)) {
      applyManualCommand(command, state, now, lastRotationTick);
    }

    if (static_cast<TickType_t>(now - lastSlotTick) >=
        pdMS_TO_TICKS(config::kSlotSamplePeriodMs)) {
      const uint8_t currentSlots = countOccupiedSlots();
      if (currentSlots == observedSlots) {
        if (stableSlotSamples < 2) {
          ++stableSlotSamples;
        }
        if (stableSlotSamples >= 2) {
          state.occupiedSlots = currentSlots;
        }
      } else {
        observedSlots = currentSlots;
        stableSlotSamples = 0;
      }
      lastSlotTick = now;
    }
    if (static_cast<TickType_t>(now - lastDhtTick) >=
        pdMS_TO_TICKS(config::kDhtSamplePeriodMs)) {
      sampleDht(state);
      lastDhtTick = now;
    }

    processPeriodicRotation(state, now, lastRotationTick,
                            rotationDirection);
    applyAutomaticControl(state);
    storeState(state);
    if (static_cast<TickType_t>(now - lastDisplayTick) >=
        pdMS_TO_TICKS(config::kDisplayFramePeriodMs)) {
      display::render(state);
      lastDisplayTick = now;
    }

    vTaskDelayUntil(&lastWakeTick,
                    pdMS_TO_TICKS(config::kSensorControlPeriodMs));
  }
}

void communicationTask(void* parameters) {
  (void)parameters;
  TickType_t lastTelemetryTick = xTaskGetTickCount();
  for (;;) {
    pollSerialCommands();
    pollAccessControl();

    MessageType type;
    uint8_t code = 0;
    if (takePendingMessage(type, code)) {
      emitProtocolFrame(type, code, getSystemStateSnapshot());
    }

    const TickType_t now = xTaskGetTickCount();
    if (static_cast<TickType_t>(now - lastTelemetryTick) >=
        pdMS_TO_TICKS(config::kTelemetryPeriodMs)) {
      emitProtocolFrame(MessageType::kTelemetry, 0,
                        getSystemStateSnapshot());
      lastTelemetryTick = now;
    }
    vTaskDelay(pdMS_TO_TICKS(config::kCommunicationPeriodMs));
  }
}

}  // namespace

SystemState getSystemStateSnapshot() {
  SystemState output;
  copyState(output);
  return output;
}

RuntimeConfig getRuntimeConfigSnapshot() { return copyRuntimeConfig(); }

bool updateRuntimeConfig(const RuntimeConfig& runtimeConfig) {
  if (!isRuntimeConfigValid(runtimeConfig)) {
    return false;
  }
  portENTER_CRITICAL(&sharedDataMux);
  sharedRuntimeConfig = runtimeConfig;
  portEXIT_CRITICAL(&sharedDataMux);
  return true;
}

bool submitControlCommand(const ControlCommand& command) {
  portENTER_CRITICAL(&sharedDataMux);
  pendingCommand = command;
  pendingCommandReady = true;
  portEXIT_CRITICAL(&sharedDataMux);
  return true;
}

void postProtocolMessage(MessageType type, uint8_t code) {
  portENTER_CRITICAL(&sharedDataMux);
  if (pendingMessageReady &&
      static_cast<uint8_t>(type) <
          static_cast<uint8_t>(pendingMessageType)) {
    portEXIT_CRITICAL(&sharedDataMux);
    return;
  }
  pendingMessageType = type;
  pendingMessageCode = code;
  pendingMessageReady = true;
  portEXIT_CRITICAL(&sharedDataMux);
}

bool createSmartEggTasks() {
  const BaseType_t sensorCreated =
      xTaskCreatePinnedToCore(sensorControlTask, "SensorControl",
                              config::kSensorControlStackBytes, nullptr, 3,
                              &sensorControlTaskHandle,
                              config::kSensorControlCore);
  if (sensorCreated != pdPASS) {
    sensorControlTaskHandle = nullptr;
    return false;
  }
  const BaseType_t communicationCreated =
      xTaskCreatePinnedToCore(communicationTask, "Communication",
                              config::kCommunicationStackBytes, nullptr, 2,
                              &communicationTaskHandle,
                              config::kCommunicationCore);
  if (communicationCreated != pdPASS) {
    vTaskDelete(sensorControlTaskHandle);
    sensorControlTaskHandle = nullptr;
    communicationTaskHandle = nullptr;
    return false;
  }
  return true;
}

void IRAM_ATTR notifyPowerSwitchFromIsr() {
  if (sensorControlTaskHandle == nullptr) {
    return;
  }
  BaseType_t higherPriorityTaskWoken = pdFALSE;
  vTaskNotifyGiveFromISR(sensorControlTaskHandle, &higherPriorityTaskWoken);
  if (higherPriorityTaskWoken == pdTRUE) {
    portYIELD_FROM_ISR();
  }
}

}  // namespace smartegg
