// Arduino_FreeRTOS.h must be the first RTOS header on AVR.
#include <Arduino_FreeRTOS.h>

#include <math.h>

#include "Config.h"
#include "ControlLogic.h"
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

void copyState(SystemState& output) {
  taskENTER_CRITICAL();
  output = sharedState;
  taskEXIT_CRITICAL();
}

void storeState(const SystemState& input) {
  taskENTER_CRITICAL();
  sharedState = input;
  taskEXIT_CRITICAL();
}

RuntimeConfig copyRuntimeConfig() {
  RuntimeConfig output;
  taskENTER_CRITICAL();
  output = sharedRuntimeConfig;
  taskEXIT_CRITICAL();
  return output;
}

bool takePendingCommand(ControlCommand& output) {
  bool available = false;
  taskENTER_CRITICAL();
  if (pendingCommandReady) {
    output = pendingCommand;
    pendingCommandReady = false;
    available = true;
  }
  taskEXIT_CRITICAL();
  return available;
}

bool takePendingMessage(MessageType& type, uint8_t& code) {
  bool available = false;
  taskENTER_CRITICAL();
  if (pendingMessageReady) {
    type = pendingMessageType;
    code = pendingMessageCode;
    pendingMessageReady = false;
    available = true;
  }
  taskEXIT_CRITICAL();
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
  const bool interrupted = ulTaskNotifyTake(pdTRUE, 0) > 0;
  if (interrupted) {
    taskENTER_CRITICAL();
    pendingSwitchEnabled = gPowerSwitchRequestedOn;
    taskEXIT_CRITICAL();
  }
  if (interrupted) {
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
  bool interrupted = false;
  taskENTER_CRITICAL();
  if (gDoorInterruptPending) {
    gDoorInterruptPending = false;
    interrupted = true;
  }
  taskEXIT_CRITICAL();
  if (!interrupted) {
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

void updateDisplay(const SystemState& state) {
  lcdClearRow(0);
  lcdClearRow(1);

  if (!state.systemEnabled) {
    lcdSetCursor(0, 0);
    lcdPrint(F("SISTEMA APAGADO"));
    lcdSetCursor(0, 1);
    lcdPrint(F("Libres:"));
    lcdPrint(static_cast<int16_t>(config::kSlotCount - state.occupiedSlots));
    lcdPrint(F(" P:"));
    lcdPrint(state.doorOpen ? F("AB") : F("CE"));
  } else if (!state.sensorOk) {
    lcdSetCursor(0, 0);
    lcdPrint(F("ERROR SENSOR DHT"));
    lcdSetCursor(0, 1);
    lcdPrint(F("Fallos:"));
    lcdPrint(static_cast<int16_t>(state.consecutiveDhtFailures));
  } else {
    lcdSetCursor(0, 0);
    lcdPrint(F("T:"));
    lcdPrint(state.temperatureC, 1);
    lcdPrint(F("C H:"));
    lcdPrint(state.humidityPct, 0);
    lcdPrint(F("%"));
    lcdSetCursor(0, 1);
    lcdPrint(F("ON C:"));
    lcdPrint(static_cast<int16_t>(state.heaterOn ? 1 : 0));
    lcdPrint(F(" V:"));
    lcdPrint(static_cast<int16_t>(state.fanOn ? 1 : 0));
    lcdPrint(F(" L:"));
    lcdPrint(static_cast<int16_t>(config::kSlotCount - state.occupiedSlots));
  }
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
      lastWakeTick - pdMS_TO_TICKS(config::kDisplayPeriodMs);
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
        pdMS_TO_TICKS(config::kDisplayPeriodMs)) {
      updateDisplay(state);
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
    vTaskDelay(pdMS_TO_TICKS(20));
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
  taskENTER_CRITICAL();
  sharedRuntimeConfig = runtimeConfig;
  taskEXIT_CRITICAL();
  return true;
}

bool submitControlCommand(const ControlCommand& command) {
  taskENTER_CRITICAL();
  pendingCommand = command;
  pendingCommandReady = true;
  taskEXIT_CRITICAL();
  return true;
}

void postProtocolMessage(MessageType type, uint8_t code) {
  taskENTER_CRITICAL();
  if (pendingMessageReady &&
      static_cast<uint8_t>(type) <
          static_cast<uint8_t>(pendingMessageType)) {
    taskEXIT_CRITICAL();
    return;
  }
  pendingMessageType = type;
  pendingMessageCode = code;
  pendingMessageReady = true;
  taskEXIT_CRITICAL();
}

bool createSmartEggTasks() {
  const BaseType_t sensorCreated =
      xTaskCreate(sensorControlTask, "SensorControl",
                  config::kSensorControlStackBytes, nullptr, 3,
                  &sensorControlTaskHandle);
  const BaseType_t communicationCreated =
      xTaskCreate(communicationTask, "Communication",
                  config::kCommunicationStackBytes, nullptr, 2, nullptr);
  return sensorCreated == pdPASS && communicationCreated == pdPASS;
}

void notifyPowerSwitchFromIsr() {
  if (sensorControlTaskHandle == nullptr) {
    return;
  }
  BaseType_t higherPriorityTaskWoken = pdFALSE;
  vTaskNotifyGiveFromISR(sensorControlTaskHandle, &higherPriorityTaskWoken);
  if (higherPriorityTaskWoken == pdTRUE) {
    taskYIELD();
  }
}

}  // namespace smartegg
