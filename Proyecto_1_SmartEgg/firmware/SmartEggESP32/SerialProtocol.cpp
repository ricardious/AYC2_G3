#include "SerialProtocol.h"

#include <driver/uart.h>
#include <esp_log.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "AccessControl.h"
#include "Config.h"
#include "ControlLogic.h"

namespace smartegg {

namespace {

// The bounded input leaves room for every command emitted by the backend.
constexpr uint16_t kCommandBufferSize = 256;
char commandBuffer[kCommandBufferSize];
uint16_t commandLength = 0;
bool droppingOverflowedLine = false;

const char* findFieldValue(const char* input, const char* fieldName) {
  const char* field = strstr(input, fieldName);
  if (field == nullptr) {
    return nullptr;
  }
  field = strchr(field, ':');
  if (field == nullptr) {
    return nullptr;
  }
  ++field;
  while (*field == ' ' || *field == '\t') {
    ++field;
  }
  return field;
}

bool readStringField(const char* input, const char* fieldName, char* output,
                     uint8_t outputSize) {
  const char* value = findFieldValue(input, fieldName);
  if (value == nullptr || *value != '"' || outputSize == 0) {
    return false;
  }
  ++value;
  uint8_t index = 0;
  while (*value != '\0' && *value != '"' && index + 1 < outputSize) {
    output[index++] = *value++;
  }
  output[index] = '\0';
  return *value == '"';
}

bool readFloatField(const char* input, const char* fieldName, float& output) {
  const char* value = findFieldValue(input, fieldName);
  if (value == nullptr) {
    return false;
  }
  char* end = nullptr;
  const double parsed = strtod(value, &end);
  if (end == value) {
    return false;
  }
  output = static_cast<float>(parsed);
  return true;
}

bool readBoolField(const char* input, const char* fieldName, bool& output) {
  const char* value = findFieldValue(input, fieldName);
  if (value == nullptr) {
    return false;
  }
  if (strncmp(value, "true", 4) == 0 || *value == '1') {
    output = true;
    return true;
  }
  if (strncmp(value, "false", 5) == 0 || *value == '0') {
    output = false;
    return true;
  }
  return false;
}

bool readIntegerField(const char* input, const char* fieldName, int& output) {
  const char* value = findFieldValue(input, fieldName);
  if (value == nullptr) {
    return false;
  }
  char* end = nullptr;
  const long parsed = strtol(value, &end, 10);
  if (end == value) {
    return false;
  }
  output = static_cast<int>(parsed);
  return true;
}

void parseRotateCommand(const char* input) {
  float requestedAngle = 0.0F;
  if (!readFloatField(input, "\"angle_degrees\"", requestedAngle)) {
    postProtocolMessage(MessageType::kError,
                        static_cast<uint8_t>(ErrorCode::kUnknownCommand));
    return;
  }
  const RuntimeConfig runtimeConfig = getRuntimeConfigSnapshot();
  const ControlCommand command = {
      CommandType::kRotate,
      clampRotationAngle(static_cast<int16_t>(requestedAngle), runtimeConfig),
      false,
  };
  submitControlCommand(command);
}

void parseActuatorCommand(const char* input) {
  char kind[12];
  char mode[12];
  bool enabled = false;
  if (!readStringField(input, "\"kind\"", kind, sizeof(kind)) ||
      !readStringField(input, "\"mode\"", mode, sizeof(mode)) ||
      !readBoolField(input, "\"enabled\"", enabled)) {
    postProtocolMessage(MessageType::kError,
                        static_cast<uint8_t>(ErrorCode::kUnknownCommand));
    return;
  }

  CommandType type = CommandType::kNone;
  if (strcmp(kind, "heater") == 0) {
    type = CommandType::kHeater;
  } else if (strcmp(kind, "fan") == 0) {
    type = CommandType::kFan;
  } else if (strcmp(kind, "buzzer") == 0) {
    type = CommandType::kBuzzer;
  }
  if (type == CommandType::kNone) {
    postProtocolMessage(MessageType::kError,
                        static_cast<uint8_t>(ErrorCode::kUnknownCommand));
    return;
  }

  const ControlCommand command = {
      type,
      static_cast<int8_t>(enabled ? 1 : 0),
      strcmp(mode, "automatic") == 0,
  };
  submitControlCommand(command);
}

void parseConfigCommand(const char* input) {
  RuntimeConfig runtimeConfig = getRuntimeConfigSnapshot();
  float value = 0.0F;
  if (readFloatField(input, "\"temperature_min_c\"", value)) {
    runtimeConfig.temperatureMinC = value;
  }
  if (readFloatField(input, "\"temperature_max_c\"", value)) {
    runtimeConfig.temperatureMaxC = value;
  }
  if (readFloatField(input, "\"humidity_min_pct\"", value)) {
    runtimeConfig.humidityMinPct = value;
  }
  if (readFloatField(input, "\"humidity_max_pct\"", value)) {
    runtimeConfig.humidityMaxPct = value;
  }
  if (readFloatField(input, "\"rotation_interval_seconds\"", value)) {
    runtimeConfig.rotationIntervalMs =
        static_cast<uint32_t>(value * 1000.0F);
  }
  if (readFloatField(input, "\"rotation_angle_degrees\"", value)) {
    runtimeConfig.rotationAngleDegrees = static_cast<int8_t>(value);
  }

  if (!isRuntimeConfigValid(runtimeConfig) ||
      !updateRuntimeConfig(runtimeConfig)) {
    postProtocolMessage(MessageType::kError,
                        static_cast<uint8_t>(ErrorCode::kInvalidConfig));
    return;
  }
  postProtocolMessage(MessageType::kEvent,
                      static_cast<uint8_t>(EventCode::kConfigUpdated));
}

void parseAccessCommand(const char* input) {
  char action[16];
  if (!readStringField(input, "\"action\"", action, sizeof(action))) {
    postProtocolMessage(MessageType::kError,
                        static_cast<uint8_t>(ErrorCode::kUnknownCommand));
    return;
  }
  if (strcmp(action, "lock") == 0) {
    handleAccessLock();
    return;
  }
  if (strcmp(action, "authorize") != 0) {
    postProtocolMessage(MessageType::kError,
                        static_cast<uint8_t>(ErrorCode::kUnknownCommand));
    return;
  }

  bool authorized = false;
  int sessionId = 0;
  int servoAngle = config::kAccessUnlockedDegrees;
  char operatorName[17] = {};
  if (!readBoolField(input, "\"authorized\"", authorized)) {
    postProtocolMessage(MessageType::kError,
                        static_cast<uint8_t>(ErrorCode::kUnknownCommand));
    return;
  }
  readIntegerField(input, "\"session_id\"", sessionId);
  readIntegerField(input, "\"servo_angle\"", servoAngle);
  readStringField(input, "\"operator_name\"", operatorName,
                  sizeof(operatorName));
  if (servoAngle < 0) {
    servoAngle = 0;
  } else if (servoAngle > 180) {
    servoAngle = 180;
  }
  handleAccessAuthorization(authorized, sessionId,
                            static_cast<uint8_t>(servoAngle), operatorName);
}

void parseCommand(const char* input) {
  char type[16];
  if (!readStringField(input, "\"type\"", type, sizeof(type))) {
    postProtocolMessage(MessageType::kError,
                        static_cast<uint8_t>(ErrorCode::kUnknownCommand));
    return;
  }
  if (strcmp(type, "rotate") == 0) {
    parseRotateCommand(input);
  } else if (strcmp(type, "actuator") == 0) {
    parseActuatorCommand(input);
  } else if (strcmp(type, "config") == 0) {
    parseConfigCommand(input);
  } else if (strcmp(type, "access") == 0) {
    parseAccessCommand(input);
  } else {
    postProtocolMessage(MessageType::kError,
                        static_cast<uint8_t>(ErrorCode::kUnknownCommand));
  }
}

}  // namespace

void initializeSerialProtocol() {
  esp_log_level_set("*", ESP_LOG_NONE);
  uart_config_t uartConfig = {};
  uartConfig.baud_rate = config::kSerialBaudRate;
  uartConfig.data_bits = UART_DATA_8_BITS;
  uartConfig.parity = UART_PARITY_DISABLE;
  uartConfig.stop_bits = UART_STOP_BITS_1;
  uartConfig.flow_ctrl = UART_HW_FLOWCTRL_DISABLE;
  uartConfig.source_clk = UART_SCLK_DEFAULT;
  ESP_ERROR_CHECK(uart_param_config(UART_NUM_0, &uartConfig));
  ESP_ERROR_CHECK(uart_set_pin(UART_NUM_0, UART_PIN_NO_CHANGE,
                               UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE,
                               UART_PIN_NO_CHANGE));
  const esp_err_t installResult =
      uart_driver_install(UART_NUM_0, 512, 0, 0, nullptr, 0);
  if (installResult != ESP_OK && installResult != ESP_ERR_INVALID_STATE) {
    ESP_ERROR_CHECK(installResult);
  }
  commandLength = 0;
  droppingOverflowedLine = false;
}

void pollSerialCommands() {
  uint8_t input[64];
  const int receivedBytes =
      uart_read_bytes(UART_NUM_0, input, sizeof(input), 0);
  for (int inputIndex = 0; inputIndex < receivedBytes; ++inputIndex) {
    const char received = static_cast<char>(input[inputIndex]);
    if (received == '\r') {
      continue;
    }
    if (received == '\n') {
      if (droppingOverflowedLine) {
        droppingOverflowedLine = false;
        commandLength = 0;
        postProtocolMessage(MessageType::kError,
                            static_cast<uint8_t>(ErrorCode::kSerialOverflow));
      } else if (commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        parseCommand(commandBuffer);
        commandLength = 0;
      }
      continue;
    }
    if (droppingOverflowedLine) {
      continue;
    }
    if (commandLength + 1 >= kCommandBufferSize) {
      droppingOverflowedLine = true;
      continue;
    }
    commandBuffer[commandLength++] = received;
  }
}

void emitProtocolFrame(MessageType type, uint8_t code,
                       const SystemState& state) {
  char frame[256];
  int length = snprintf(frame, sizeof(frame), "MSG:%u",
                        static_cast<unsigned>(type));
  if (type == MessageType::kEvent) {
    length += snprintf(frame + length, sizeof(frame) - length, ",EVENT:%u",
                       code);
  } else if (type == MessageType::kError) {
    length += snprintf(frame + length, sizeof(frame) - length, ",ERROR:%u",
                       code);
  }

  if (!state.hasValidReading) {
    length += snprintf(frame + length, sizeof(frame) - length,
                       ",SENSOR:0\n");
    uart_write_bytes(UART_NUM_0, frame, length);
    return;
  }

  length += snprintf(
      frame + length, sizeof(frame) - length,
      ",TEMP:%.2f,HUM:%.1f,DOOR:%u,SLOTS:%u,HEATER:%u,FAN:%u,SERVO:%d,"
      "BUZZER:%u,POWER:%u,SENSOR:%u\n",
      static_cast<double>(state.temperatureC),
      static_cast<double>(state.humidityPct), state.doorOpen ? 1U : 0U,
      state.occupiedSlots, state.heaterOn ? 1U : 0U,
      state.fanOn ? 1U : 0U, state.servoAngleDegrees,
      state.buzzerOn ? 1U : 0U, state.systemEnabled ? 1U : 0U,
      state.sensorOk ? 1U : 0U);
  uart_write_bytes(UART_NUM_0, frame, length);
}

void emitRfidAccessRequest(const char* uid) {
  char frame[64];
  const int length = snprintf(frame, sizeof(frame), "RFID:%s\n", uid);
  if (length > 0) {
    uart_write_bytes(UART_NUM_0, frame,
                     length < static_cast<int>(sizeof(frame))
                         ? length
                         : static_cast<int>(sizeof(frame) - 1));
  }
}

void emitDoorAccessEvent(int sessionId, bool open) {
  char frame[96];
  const int length = snprintf(frame, sizeof(frame),
                              "ACCESS:DOOR,SESSION:%d,STATE:%s\n", sessionId,
                              open ? "OPEN" : "CLOSED");
  if (length > 0) {
    uart_write_bytes(UART_NUM_0, frame,
                     length < static_cast<int>(sizeof(frame))
                         ? length
                         : static_cast<int>(sizeof(frame) - 1));
  }
}

void emitAccessCancelEvent(int sessionId) {
  char frame[64];
  const int length = snprintf(frame, sizeof(frame),
                              "ACCESS:CANCEL,SESSION:%d\n", sessionId);
  if (length > 0) {
    uart_write_bytes(UART_NUM_0, frame,
                     length < static_cast<int>(sizeof(frame))
                         ? length
                         : static_cast<int>(sizeof(frame) - 1));
  }
}

}  // namespace smartegg
