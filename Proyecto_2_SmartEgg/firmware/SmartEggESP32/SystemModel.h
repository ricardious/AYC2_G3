#pragma once

#include <stdint.h>

namespace smartegg {

enum class MessageType : uint8_t {
  kTelemetry = 1,
  kState = 2,
  kEvent = 3,
  kError = 4,
};

enum class EventCode : uint8_t {
  kNone = 0,
  kBoot = 1,
  kPowerOn = 2,
  kPowerOff = 3,
  kDoorOpen = 4,
  kDoorClosed = 5,
  kRotation = 6,
  kConfigUpdated = 7,
  kActuatorCommand = 8,
  kDhtRecovered = 9,
};

enum class ErrorCode : uint8_t {
  kNone = 0,
  kDhtReadFailed = 1,
  kInvalidConfig = 2,
  kUnknownCommand = 3,
  kSerialOverflow = 4,
  kSystemDisabled = 5,
  kTaskAllocationFailed = 6,
};

enum class CommandType : uint8_t {
  kNone = 0,
  kRotate = 1,
  kHeater = 2,
  kFan = 3,
  kBuzzer = 4,
};

// -1 means automatic control, 0 manual OFF and 1 manual ON.
struct ManualOverrides {
  int8_t heater;
  int8_t fan;
  int8_t buzzer;
};

struct RuntimeConfig {
  float temperatureMinC;
  float temperatureMaxC;
  float humidityMinPct;
  float humidityMaxPct;
  uint32_t rotationIntervalMs;
  int8_t rotationAngleDegrees;
};

struct SystemState {
  float temperatureC;
  float humidityPct;
  bool hasValidReading;
  bool sensorOk;
  bool systemEnabled;
  bool doorOpen;
  uint8_t occupiedSlots;
  uint8_t consecutiveDhtFailures;
  bool heaterOn;
  bool fanOn;
  bool buzzerOn;
  int8_t servoAngleDegrees;  // Signed angle relative to the 90-degree center.
};

struct ActuatorDecision {
  bool heaterOn;
  bool fanOn;
  bool buzzerOn;
};

struct ControlCommand {
  CommandType type;
  int8_t value;
  bool automatic;
};

}  // namespace smartegg
