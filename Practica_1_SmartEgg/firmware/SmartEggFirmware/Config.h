#pragma once

#include <Arduino.h>

namespace smartegg {
namespace config {

// ---------------------------------------------------------------- Hardware
// Arduino Uno R3: D0/D1 remain reserved for UART/USB and A4/A5 for I2C.
constexpr uint8_t kPowerButtonPin = 2;  // INT0, SPDT toggle common terminal.
constexpr uint8_t kDoorSwitchPin = 3;  // INT1, COM to GND and NO to D3.
constexpr uint8_t kDhtPin = 4;
constexpr uint8_t kHeaterRelayPin = 5;
constexpr uint8_t kFanRelayPin = 6;  // IN2 of the 5 V four-channel relay module.
constexpr uint8_t kBuzzerPin = 7;  // Active 5 V buzzer; do not use tone().
constexpr uint8_t kServoPin = 8;
constexpr uint8_t kSlotPins[] = {9, 10, 11, 12};
constexpr uint8_t kSlotCount = sizeof(kSlotPins) / sizeof(kSlotPins[0]);
constexpr uint8_t kStatusLedPin = LED_BUILTIN;

// Change these levels only if the selected relay/switch module works inverted.
// Physical test: briefly connecting IN1 to GND energized the selected channel.
constexpr bool kRelaysActiveLow = true;
// With INPUT_PULLUP and COM->GND/NO->D3, a normally mounted switch is LOW
// while the closed door presses it and HIGH when the open door releases it.
constexpr uint8_t kDoorOpenLevel = HIGH;
constexpr uint8_t kSlotOccupiedLevel = LOW;
constexpr uint8_t kPowerSwitchOnLevel = LOW;

// Confirmed component for the physical prototype.
constexpr uint8_t kDhtType = 11;
constexpr uint8_t kMaxConsecutiveDhtFailures = 3;

// Confirmed I2C address for the physical LCD backpack.
constexpr uint8_t kLcdAddress = 0x27;
constexpr uint8_t kLcdColumns = 16;
constexpr uint8_t kLcdRows = 2;

// ------------------------------------------------------------- Set points
// Explicit values from the practice statement/rubric. They can be updated at
// runtime through a CONFIG command from the backend.
constexpr float kDefaultTemperatureMinC = 37.0F;
constexpr float kDefaultTemperatureMaxC = 38.0F;
constexpr float kDefaultHumidityMinPct = 50.0F;
constexpr float kDefaultHumidityMaxPct = 65.0F;
constexpr float kTemperatureHysteresisC = 0.2F;
constexpr int8_t kDefaultRotationAngleDegrees = 45;
constexpr uint32_t kDefaultRotationIntervalMs = 120000UL;
constexpr uint8_t kServoCenterDegrees = 90;

// ----------------------------------------------------------------- Timing
constexpr uint32_t kSerialBaudRate = 115200UL;
constexpr uint16_t kSensorControlPeriodMs = 50;
constexpr uint16_t kSlotSamplePeriodMs = 100;
constexpr uint16_t kDhtSamplePeriodMs = 2000;
// The display is diff-rendered, so a frame that changes nothing costs no I2C
// traffic. Ticking at ~7 fps is what makes the animated glyphs read smoothly.
constexpr uint16_t kDisplayFramePeriodMs = 150;
// Frames between marquee steps on the sensor-fault screen.
constexpr uint8_t kMarqueeFrameDivider = 2;
constexpr uint16_t kTelemetryPeriodMs = 2000;
constexpr uint16_t kPowerSwitchDebounceMs = 250;

// ------------------------------------------------------------- Boot splash
// Blocking delays used only by the splash animation, which runs from setup()
// before the scheduler starts. Total added boot time stays close to one second.
constexpr uint8_t kSplashLetterMs = 40;
constexpr uint8_t kSplashEggMs = 25;
constexpr uint8_t kSplashHatchMs = 110;
constexpr uint16_t kSplashHoldMs = 200;

// ---------------------------------------------------------- FreeRTOS stacks
// Values are bytes on the AVR port. The local DHT driver uses a 5-byte frame,
// keeping both task stacks viable on the 2 KB Uno.
constexpr uint16_t kSensorControlStackBytes = 184;
constexpr uint16_t kCommunicationStackBytes = 160;

}  // namespace config
}  // namespace smartegg
