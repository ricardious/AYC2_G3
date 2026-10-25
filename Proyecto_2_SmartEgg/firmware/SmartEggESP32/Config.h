#pragma once

#include <stdint.h>

namespace smartegg {
namespace config {

// ESP32 DevKit V1 pinout. GPIO 34, 35 and 36 are input-only and require the
// external pull-ups documented in firmware/README.md.
constexpr uint8_t kRfidSsPin = 5;
constexpr uint8_t kRfidRstPin = 4;
constexpr uint8_t kDhtPin = 15;
constexpr uint8_t kHeaterRelayPin = 26;
constexpr uint8_t kFanRelayPin = 27;
constexpr uint8_t kBuzzerPin = 14;
constexpr uint8_t kTrayServoPin = 25;
constexpr uint8_t kAccessServoPin = 33;
// Door limit switch: COM -> GND, NO -> GPIO 16. The lever is pressed when the
// door is closed, so the input reads LOW when closed and HIGH when open.
constexpr uint8_t kDoorSwitchPin = 16;
constexpr uint8_t kPowerSwitchPin = 17;
constexpr uint8_t kSlotPins[] = {32, 34, 35, 36};
constexpr uint8_t kSlotCount = sizeof(kSlotPins) / sizeof(kSlotPins[0]);
constexpr uint8_t kStatusLedPin = 2;
// Red LED (220 ohm to GND) that stays on while the system is locked.
constexpr uint8_t kLockLedPin = 13;
constexpr uint8_t kI2cSdaPin = 21;
constexpr uint8_t kI2cSclPin = 22;
constexpr uint8_t kSpiSckPin = 18;
constexpr uint8_t kSpiMisoPin = 19;
constexpr uint8_t kSpiMosiPin = 23;

constexpr bool kRelaysActiveLow = true;
constexpr uint8_t kDoorOpenLevel = 1;
constexpr uint8_t kSlotOccupiedLevel = 0;
constexpr uint8_t kPowerSwitchOnLevel = 0;
constexpr uint8_t kDhtType = 11;
constexpr uint8_t kMaxConsecutiveDhtFailures = 3;
constexpr uint8_t kLcdAddress = 0x27;
constexpr uint8_t kLcdColumns = 16;
constexpr uint8_t kLcdRows = 2;

constexpr float kDefaultTemperatureMinC = 37.0F;
constexpr float kDefaultTemperatureMaxC = 38.0F;
constexpr float kDefaultHumidityMinPct = 50.0F;
constexpr float kDefaultHumidityMaxPct = 65.0F;
constexpr float kTemperatureHysteresisC = 0.2F;
constexpr int8_t kDefaultRotationAngleDegrees = 45;
constexpr uint32_t kDefaultRotationIntervalMs = 120000UL;
constexpr uint8_t kServoCenterDegrees = 90;
constexpr uint8_t kAccessLockedDegrees = 0;
constexpr uint8_t kAccessUnlockedDegrees = 90;

constexpr uint32_t kSerialBaudRate = 115200UL;
constexpr uint16_t kSensorControlPeriodMs = 50;
constexpr uint16_t kCommunicationPeriodMs = 20;
constexpr uint16_t kSlotSamplePeriodMs = 100;
constexpr uint16_t kDhtSamplePeriodMs = 2000;
constexpr uint16_t kDisplayFramePeriodMs = 150;
constexpr uint8_t kMarqueeFrameDivider = 2;
constexpr uint16_t kTelemetryPeriodMs = 2000;
constexpr uint16_t kPowerSwitchDebounceMs = 250;
constexpr uint32_t kRfidCooldownMs = 2000UL;
// Neon may need a few seconds to resume after being idle. Keep the RFID request
// alive long enough for a cold database response without blocking other tasks.
constexpr uint32_t kAccessAuthorizationTimeoutMs = 15000UL;
constexpr uint32_t kUnlockTimeoutMs = 15000UL;
// If the door switch never reports CLOSED (loose lever, bad wiring), the
// session ends anyway so the RFID reader does not stay ignored until reboot.
constexpr uint32_t kDoorOpenTimeoutMs = 120000UL;
constexpr uint16_t kDoorDebounceMs = 100;

constexpr uint8_t kSplashLetterMs = 40;
constexpr uint8_t kSplashEggMs = 25;
constexpr uint8_t kSplashHatchMs = 110;
constexpr uint16_t kSplashHoldMs = 200;

// ESP-IDF expresses task stack sizes in bytes. Communication needs more room
// because serial parsing and the RFID flow execute on that task.
constexpr uint32_t kSensorControlStackBytes = 4096;
constexpr uint32_t kCommunicationStackBytes = 8192;
constexpr uint8_t kSensorControlCore = 1;
constexpr uint8_t kCommunicationCore = 0;

}  // namespace config
}  // namespace smartegg
