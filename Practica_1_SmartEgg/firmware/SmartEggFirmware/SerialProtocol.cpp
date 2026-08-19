#include "SerialProtocol.h"

#include <stdlib.h>
#include <string.h>

#include "Config.h"
#include "ControlLogic.h"

namespace smartegg {

namespace {

constexpr uint16_t kCommandBufferSize = 208;
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
  } else {
    postProtocolMessage(MessageType::kError,
                        static_cast<uint8_t>(ErrorCode::kUnknownCommand));
  }
}

void printBoolean(bool value) { Serial.print(value ? 1 : 0); }

}  // namespace

void initializeSerialProtocol() {
  Serial.begin(config::kSerialBaudRate);
  commandLength = 0;
  droppingOverflowedLine = false;
}

void pollSerialCommands() {
  while (Serial.available() > 0) {
    const char received = static_cast<char>(Serial.read());
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
  Serial.print(F("MSG:"));
  Serial.print(static_cast<uint8_t>(type));
  if (type == MessageType::kEvent) {
    Serial.print(F(",EVENT:"));
    Serial.print(code);
  } else if (type == MessageType::kError) {
    Serial.print(F(",ERROR:"));
    Serial.print(code);
  }

  // When the DHT has never produced a valid reading, do not invent numeric
  // environmental values. Consumers identify this short error frame by MSG=4.
  if (!state.hasValidReading) {
    Serial.print(F(",SENSOR:0"));
    Serial.println();
    return;
  }

  // Numeric key:value fields are accepted by both Arduino Serial Plotter and
  // the backend's CSV parser. NODE is intentionally omitted so the backend's
  // configured default node identifier is used.
  Serial.print(F(",TEMP:"));
  Serial.print(state.temperatureC, 2);
  Serial.print(F(",HUM:"));
  Serial.print(state.humidityPct, 1);
  Serial.print(F(",DOOR:"));
  printBoolean(state.doorOpen);
  Serial.print(F(",SLOTS:"));
  Serial.print(state.occupiedSlots);
  Serial.print(F(",HEATER:"));
  printBoolean(state.heaterOn);
  Serial.print(F(",FAN:"));
  printBoolean(state.fanOn);
  Serial.print(F(",SERVO:"));
  Serial.print(state.servoAngleDegrees);
  Serial.print(F(",BUZZER:"));
  printBoolean(state.buzzerOn);
  Serial.print(F(",POWER:"));
  printBoolean(state.systemEnabled);
  Serial.print(F(",SENSOR:"));
  printBoolean(state.sensorOk);
  Serial.println();
}

}  // namespace smartegg
