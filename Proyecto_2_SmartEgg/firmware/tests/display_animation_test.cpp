#include <assert.h>
#include <stdint.h>
#include <string.h>

#include "Config.h"
#include "Display.h"
#include "Hardware.h"

namespace {

int64_t nowUs = 0;
char lcdRows[2][17] = {};
uint8_t lcdGlyphs[8][8] = {};
uint8_t cursorRow = 0;
uint8_t cursorColumn = 0;

void advanceFrames(uint32_t frames, const smartegg::SystemState& state) {
  for (uint32_t index = 0; index < frames; ++index) {
    nowUs += static_cast<int64_t>(smartegg::config::kDisplayFramePeriodMs) *
             1000LL;
    smartegg::display::render(state);
  }
}

void expectText(uint8_t row, uint8_t column, const char* expected) {
  assert(memcmp(&lcdRows[row][column], expected, strlen(expected)) == 0);
}

}  // namespace

extern "C" int64_t esp_timer_get_time(void) { return nowUs; }

namespace smartegg {

bool lcdIsAvailable() { return true; }
void lcdSetBacklight(bool) {}
void lcdCreateChar(uint8_t index, const uint8_t* bitmap) {
  memcpy(lcdGlyphs[index], bitmap, 8);
}
void lcdSetCursor(uint8_t column, uint8_t row) {
  cursorColumn = column;
  cursorRow = row;
}
void lcdPrint(char value) {
  assert(cursorRow < 2 && cursorColumn < 16);
  lcdRows[cursorRow][cursorColumn++] = value;
}

}  // namespace smartegg

int main() {
  const smartegg::SystemState state = {
      37.5F, 58.0F, true, true, true, false, 2, 0,
      false, false, false, 45, false};
  smartegg::display::initialize();

  smartegg::display::showAccessFeedback(
      smartegg::display::AccessFeedback::kReading, 15000);
  smartegg::display::render(state);
  assert(static_cast<uint8_t>(lcdRows[0][0]) == 5);
  expectText(0, 1, "TARJETA LEIDA");
  expectText(1, 2, "VERIFICANDO");
  assert(lcdGlyphs[5][3] == 31);  // Whole egg.

  advanceFrames(4, state);
  assert(lcdGlyphs[5][3] == 0);  // Chick emerges from cracked shell.
  advanceFrames(10, state);
  assert(lcdGlyphs[5][3] == 0);  // Does not restart during a slow backend call.

  smartegg::display::showAccessGranted("RICARDO CASTANEDA", 5000);
  smartegg::display::render(state);
  assert(static_cast<uint8_t>(lcdRows[0][0]) == 5);
  expectText(0, 2, "BIENVENIDO");
  expectText(1, 0, "RICARDO CASTANED");
  advanceFrames(2, state);
  assert(lcdGlyphs[5][3] == 16);  // Raised wing.

  advanceFrames(9, state);
  expectText(1, 0, "ICARDO CASTANEDA");  // Final letter is not cut off.
  advanceFrames(1, state);
  expectText(0, 0, "ACCESO PERMITIDO");
  expectText(1, 0, "> ABRA LA PUERTA");
  assert(lcdGlyphs[5][3] == 14);  // Restored slot/egg bitmap.

  advanceFrames(8, state);
  expectText(1, 0, "RICARDO CASTANED");
  advanceFrames(14, state);
  assert(static_cast<uint8_t>(lcdRows[1][0]) == 5);
  assert(lcdGlyphs[5][3] == 14);

  smartegg::display::showAccessFeedback(
      smartegg::display::AccessFeedback::kReading, 15000);
  smartegg::display::render(state);
  assert(lcdGlyphs[5][3] == 31);  // Every new card starts with a whole egg.
  smartegg::display::showAccessFeedback(
      smartegg::display::AccessFeedback::kDenied, 2500);
  smartegg::display::render(state);
  assert(static_cast<uint8_t>(lcdRows[0][0]) == 4);
  expectText(0, 1, "ACCESO DENEGADO");
  assert(lcdGlyphs[5][3] == 14);  // The hatch glyph is restored on rejection.
  advanceFrames(3, state);
  expectText(1, 1, "NO AUTORIZADO");
  assert(lcdGlyphs[4][3] == 14);  // Shield fills with the cross once.

  smartegg::display::showAccessFeedback(
      smartegg::display::AccessFeedback::kTimeout, 2500);
  smartegg::display::render(state);
  assert(static_cast<uint8_t>(lcdRows[0][0]) == 4);
  expectText(0, 2, "SIN RESPUESTA");
  assert(lcdGlyphs[4][0] == 31);  // Hourglass instead of . o O.
  advanceFrames(17, state);
  assert(lcdGlyphs[4][4] == 31);  // Bell restored for the running screen.

  smartegg::SystemState disabled = state;
  disabled.systemEnabled = false;
  smartegg::display::render(disabled);
  expectText(0, 0, "SISTEMA APAGADO");
  assert(static_cast<uint8_t>(lcdRows[0][15]) == 4);
  assert(lcdGlyphs[4][4] == 17);  // Power symbol, not a text spinner.
  smartegg::display::render(state);
  assert(lcdGlyphs[4][4] == 31);  // The original bell is available again.
}
