#pragma once

#include <stdint.h>

#include "SystemModel.h"

namespace smartegg {
namespace display {

enum class AccessFeedback : uint8_t {
  kReading,
  kGranted,
  kDenied,
  kTimeout,
  kReaderError,
};

// Loads the CGRAM glyph set and plays the boot animation after LCD startup.
void initialize();

// Composes the current screen and pushes only the cells that actually changed.
// One call advances the animation by one frame, so the caller is expected to
// tick it every config::kDisplayFramePeriodMs. When nothing moves on screen it
// costs zero I2C traffic.
void render(const SystemState& state);

// Temporarily replaces the operational screen with animated RFID feedback.
// This function is safe to call from the communication task while render()
// runs on the sensor/control task.
void showAccessFeedback(AccessFeedback feedback, uint32_t durationMs);

// Shows an authorized operator's LCD-safe name, alternating with the door
// instruction while the access servo is unlocked.
void showAccessGranted(const char* operatorName, uint32_t durationMs);

// Forces the next render to repaint all 32 cells.
void invalidate();

// Paints a terminal error directly, for the paths that never reach the
// scheduler and therefore never call render(). Without this the panel would
// stay blank on a fatal fault, which reads as "nothing is wrong".
void showFatalRtos();

}  // namespace display
}  // namespace smartegg
