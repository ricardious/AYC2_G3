#pragma once

#include <stdint.h>

#include "SystemModel.h"

namespace smartegg {
namespace display {

// Loads the CGRAM glyph set and plays the boot animation. Must run after the
// LCD controller is initialized and before the scheduler starts, because the
// splash intentionally blocks with delay().
void initialize();

// Composes the current screen and pushes only the cells that actually changed.
// One call advances the animation by one frame, so the caller is expected to
// tick it every config::kDisplayFramePeriodMs. When nothing moves on screen it
// costs zero I2C traffic.
void render(const SystemState& state);

// Forces the next render to repaint all 32 cells.
void invalidate();

// Paints a terminal error directly, for the paths that never reach the
// scheduler and therefore never call render(). Without this the panel would
// stay blank on a fatal fault, which reads as "nothing is wrong".
void showFatalRtos();

}  // namespace display
}  // namespace smartegg
