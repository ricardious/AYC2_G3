#include "Display.h"

#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <stdlib.h>
#include <string.h>

#include "Config.h"
#include "Hardware.h"

namespace smartegg {
namespace display {

namespace {

// --------------------------------------------------------------- Glyph set
// The HD44780 exposes eight programmable 5x8 glyphs. Slots 2, 3 and 5 hold
// animated icons: instead of rewriting the affected cells on every frame, the
// renderer overwrites the CGRAM bitmap and the controller redraws every
// instance of that code point by itself. That keeps a full animation step at
// eight byte writes regardless of how many times the icon appears.
constexpr uint8_t kGlyphThermometer = 0;
constexpr uint8_t kGlyphDroplet = 1;
constexpr uint8_t kGlyphHeater = 2;   // animated, kHeaterFrames frames
constexpr uint8_t kGlyphFan = 3;      // animated, kFanFrames frames
constexpr uint8_t kGlyphAlarm = 4;    // animated, kAlarmFrames frames
constexpr uint8_t kGlyphSlotFull = 5;
constexpr uint8_t kGlyphSlotEmpty = 6;
constexpr uint8_t kGlyphDoorOpen = 7;

// Code points served by the controller ROM, which keeps three CGRAM slots free.
constexpr char kCharDegree = static_cast<char>(0xDF);
constexpr char kCharBlock = static_cast<char>(0xFF);

constexpr uint8_t kHeaterFrames = 3;
constexpr uint8_t kFanFrames = 4;
constexpr uint8_t kAlarmFrames = 4;
constexpr uint8_t kHatchFrames = 5;

const uint8_t kThermometerBitmap[8] = {
    0b00100, 0b01010, 0b01010, 0b01110,
    0b01110, 0b11111, 0b11111, 0b01110,
};

const uint8_t kDropletBitmap[8] = {
    0b00100, 0b00100, 0b01110, 0b01110,
    0b11111, 0b11111, 0b11111, 0b01110,
};

const uint8_t kSlotFullBitmap[8] = {
    0b00000, 0b00100, 0b01110, 0b01110,
    0b11111, 0b11111, 0b11111, 0b01110,
};

const uint8_t kSlotEmptyBitmap[8] = {
    0b00000, 0b00100, 0b01010, 0b01010,
    0b10001, 0b10001, 0b10001, 0b01110,
};

// Splash only. The loading row is filled with the slot glyph, so walking this
// sequence through that one CGRAM slot cracks every egg on screen at once.
const uint8_t kHatchBitmaps[kHatchFrames][8] = {
    // Whole egg.
    {0b00100, 0b01110, 0b01110, 0b11111, 0b11111, 0b11111, 0b11111, 0b01110},
    // First chip in the shell.
    {0b00100, 0b01110, 0b01110, 0b11111, 0b11011, 0b11111, 0b11111, 0b01110},
    // The crack runs across.
    {0b00100, 0b01110, 0b01110, 0b11011, 0b10101, 0b11011, 0b11111, 0b01110},
    // The cap lifts off.
    {0b00100, 0b01110, 0b00000, 0b11111, 0b11111, 0b11111, 0b11111, 0b01110},
    // A chick with its beak clear of a broken shell rim.
    {0b00100, 0b01110, 0b00110, 0b00000, 0b10101, 0b11111, 0b11111, 0b01110},
};

const uint8_t kDoorOpenBitmap[8] = {
    0b01111, 0b01001, 0b01001, 0b01011,
    0b01001, 0b01001, 0b01001, 0b01111,
};

// A flame leaning left, right and then standing tall: the irregular cadence
// reads as fire rather than as a blinking symbol.
const uint8_t kHeaterBitmaps[kHeaterFrames][8] = {
    {0b00100, 0b00110, 0b01100, 0b01110, 0b11111, 0b11111, 0b01110, 0b00000},
    {0b00100, 0b01100, 0b00110, 0b01110, 0b11111, 0b11111, 0b01110, 0b00000},
    {0b00100, 0b00100, 0b01110, 0b01110, 0b11111, 0b11111, 0b11111, 0b01110},
};

// One blade sweeping through four quarter turns.
const uint8_t kFanBitmaps[kFanFrames][8] = {
    {0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000, 0b00000},
    {0b10000, 0b01000, 0b01000, 0b00100, 0b00010, 0b00010, 0b00001, 0b00000},
    {0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000},
    {0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000, 0b00000},
};

// A bell swinging left and right, passing through the centre both ways.
const uint8_t kAlarmBitmaps[kAlarmFrames][8] = {
    {0b00100, 0b01110, 0b01110, 0b01110, 0b11111, 0b00000, 0b00100, 0b00000},
    {0b00010, 0b00110, 0b01110, 0b01110, 0b11111, 0b00000, 0b01000, 0b00000},
    {0b00100, 0b01110, 0b01110, 0b01110, 0b11111, 0b00000, 0b00100, 0b00000},
    {0b01000, 0b01100, 0b01110, 0b01110, 0b11111, 0b00000, 0b00010, 0b00000},
};

// ------------------------------------------------------------ Frame buffers
// The Uno cannot afford two complete 32-byte frame buffers alongside FreeRTOS.
// Keep one composed frame and a compact fingerprint per physical row. A row is
// rewritten only when its fingerprint changes; animated CGRAM glyphs still
// update without rewriting their cells.
constexpr uint8_t kDisplayRowCells = config::kLcdColumns;
char backBuffer[kDisplayRowCells];
uint16_t frontRowFingerprint[config::kLcdRows];
bool displayHardwareReady = false;
uint8_t composingRow = 0;
uint8_t forcedRowsMask = (1U << config::kLcdRows) - 1U;

enum class Screen : uint8_t {
  kBoot,
  kRunning,
  kDisabled,
  kSensorFault,
  kAccess,
};

Screen currentScreen = Screen::kBoot;
uint8_t animationFrame = 0;
uint8_t marqueeOffset = 0;
portMUX_TYPE accessFeedbackMux = portMUX_INITIALIZER_UNLOCKED;
AccessFeedback activeAccessFeedback = AccessFeedback::kReading;
char activeOperatorName[17] = {};
int64_t accessFeedbackExpiresAtUs = 0;

// Last bitmap pushed to CGRAM for each animated slot; 0xFF means "unknown", so
// the next visible frame is uploaded even if its index happens to match.
uint8_t uploadedHeaterFrame = 0xFF;
uint8_t uploadedFanFrame = 0xFF;
uint8_t uploadedAlarmFrame = 0xFF;

const char kFaultMarquee[] =
    "Revise DATA en GPIO15, 3.3V y GND comun.   ";
constexpr uint8_t kFaultMarqueeLength = sizeof(kFaultMarquee) - 1;

// ------------------------------------------------------------- Compositing
void clearBackBuffer() {
  for (uint8_t column = 0; column < config::kLcdColumns; ++column) {
    backBuffer[column] = ' ';
  }
}

void put(uint8_t row, uint8_t column, char value) {
  if (row == composingRow && column < config::kLcdColumns) {
    backBuffer[column] = value;
  }
}

void putText(uint8_t row, uint8_t column, const char* text) {
  const char* cursor = text;
  char value = *cursor++;
  while (value != '\0' && column < config::kLcdColumns) {
    put(row, column++, value);
    value = *cursor++;
  }
}

// Right-aligns an integer inside a fixed field so digits never shift sideways
// between frames, which is what makes a numeric readout look stable.
void putIntRight(uint8_t row, uint8_t column, uint8_t width, int16_t value,
                 bool forceSign) {
  const bool negative = value < 0;
  uint16_t magnitude = negative ? static_cast<uint16_t>(-value)
                                : static_cast<uint16_t>(value);
  uint8_t position = static_cast<uint8_t>(column + width);

  do {
    if (position == column) {
      break;
    }
    put(row, --position, static_cast<char>('0' + (magnitude % 10)));
    magnitude /= 10;
  } while (magnitude != 0);

  if ((negative || forceSign) && position > column) {
    put(row, --position, negative ? '-' : '+');
  }
}

void putSlots(uint8_t row, uint8_t column, uint8_t occupiedSlots) {
  for (uint8_t index = 0; index < config::kSlotCount; ++index) {
    put(row, static_cast<uint8_t>(column + index),
        static_cast<char>(index < occupiedSlots ? kGlyphSlotFull
                                                : kGlyphSlotEmpty));
  }
}

// ------------------------------------------------------------------ Screens
// Layout on the 16x2 glass. Row 1 is split into three groups of even width
// with two blank gutters between them, so nothing crowds and nothing floats:
//
//        0123456789012345
//   row0 |T 37.5C h 58% D|   temperature left, humidity right, door flag
//   row1 |OOOo  +45  * %!|   tray, tray angle, then heater/fan/alarm
//
// Slot glyphs sit at columns 0-3 on this screen and on the disabled screen, so
// the tray stays in the same place whatever the system is doing.
// The integer field is three columns wide so a sub-zero reading keeps its sign
// instead of being clamped into a positive-looking number on a DHT22.
void composeRunning(const SystemState& state) {
  int16_t tenths = static_cast<int16_t>(state.temperatureC * 10.0F +
                                        (state.temperatureC < 0 ? -0.5F : 0.5F));
  if (tenths > 999) {
    tenths = 999;
  } else if (tenths < -400) {
    tenths = -400;
  }
  const int16_t wholeDegrees = static_cast<int16_t>(tenths / 10);
  uint8_t decimal = static_cast<uint8_t>(tenths % 10);
  if (tenths < 0) {
    decimal = static_cast<uint8_t>(-static_cast<int8_t>(decimal));
  }

  put(0, 0, static_cast<char>(kGlyphThermometer));
  putIntRight(0, 1, 3, wholeDegrees, false);
  put(0, 4, '.');
  put(0, 5, static_cast<char>('0' + decimal));
  put(0, 6, kCharDegree);
  put(0, 7, 'C');
  put(0, 9, static_cast<char>(kGlyphDroplet));

  int16_t humidity = static_cast<int16_t>(state.humidityPct + 0.5F);
  if (humidity > 100) {
    humidity = 100;
  } else if (humidity < 0) {
    humidity = 0;
  }
  putIntRight(0, 10, 3, humidity, false);
  put(0, 13, '%');
  if (state.doorOpen) {
    put(0, 15, static_cast<char>(kGlyphDoorOpen));
  }

  putSlots(1, 0, state.occupiedSlots);

  putIntRight(1, 6, 3, state.servoAngleDegrees,
              state.servoAngleDegrees > 0);
  put(1, 9, kCharDegree);

  if (state.heaterOn) {
    put(1, 12, static_cast<char>(kGlyphHeater));
  }
  if (state.fanOn) {
    put(1, 13, static_cast<char>(kGlyphFan));
  }
  // The bell is hidden on every other frame so the alarm also blinks for
  // anyone watching from a distance, not only through the buzzer.
  if (state.buzzerOn && (animationFrame & 0x02) != 0) {
    put(1, 14, static_cast<char>(kGlyphAlarm));
  }
}

// The system is switched off at the toggle: no actuator state to show, so the
// screen reports what is still being sensed plus a slow breathing marker.
void composeDisabled(const SystemState& state) {
  static const char kBreath[] = {' ', '.', 'o', 'O', 'o', '.'};
  putText(0, 0, "SISTEMA APAGADO");
  put(0, 15, kBreath[(animationFrame / 3) % sizeof(kBreath)]);

  putSlots(1, 0, state.occupiedSlots);
  putText(1, 5, "Libres:");
  putIntRight(1, 12, 1,
              static_cast<int16_t>(config::kSlotCount - state.occupiedSlots),
              false);
  if (state.doorOpen) {
    put(1, 15, static_cast<char>(kGlyphDoorOpen));
  }
}

// The headline is static and fills the row exactly, so the failure is readable
// the instant you look at the panel. The hint scrolls underneath because it
// does not fit in 16 columns, and its movement doubles as proof that the
// control task is still running rather than frozen.
void composeSensorFault(const SystemState& state) {
  (void)state;
  putText(0, 0, "ERROR SENSOR DHT");

  for (uint8_t column = 0; column < config::kLcdColumns; ++column) {
    const uint8_t index =
        static_cast<uint8_t>((marqueeOffset + column) % kFaultMarqueeLength);
    put(1, column, kFaultMarquee[index]);
  }
}

void composeAccessFeedback(AccessFeedback feedback, const char* operatorName) {
  // Keep the animation inside the character subset shared by HD44780 ROM
  // variants. In particular, code point 0x5C (ASCII backslash) is rendered as
  // a Yen sign or another regional glyph by many LCD modules.
  static const char kSpinner[] = {'.', 'o', 'O', 'o'};
  const uint8_t phase = animationFrame % 4;

  switch (feedback) {
    case AccessFeedback::kReading: {
      putText(0, 1, "TARJETA LEIDA");
      put(1, 0, kSpinner[phase]);
      putText(1, 2, "Verificando");
      const uint8_t dots = static_cast<uint8_t>((phase % 3) + 1);
      for (uint8_t index = 0; index < dots; ++index) {
        put(1, static_cast<uint8_t>(13 + index), '.');
      }
      break;
    }
    case AccessFeedback::kGranted:
      putText(0, 0, "ACCESO PERMITIDO");
      if (operatorName[0] != '\0' && ((animationFrame / 8U) & 1U) == 0) {
        putText(1, 0, operatorName);
      } else {
        putText(1, 1, "ABRA LA PUERTA");
        put(1, 0, (phase & 1U) == 0 ? '>' : ' ');
        put(1, 15, (phase & 1U) == 0 ? '<' : ' ');
      }
      break;
    case AccessFeedback::kDenied:
      putText(0, 0, "ACCESO DENEGADO");
      putText(1, 1, "NO AUTORIZADO");
      if ((phase & 1U) == 0) {
        put(1, 0, 'X');
        put(1, 15, 'X');
      }
      break;
    case AccessFeedback::kTimeout:
      putText(0, 1, "SIN RESPUESTA");
      putText(1, 0, "INTENTE DE NUEVO");
      put(0, 14, kSpinner[phase]);
      break;
    case AccessFeedback::kReaderError:
      putText(0, 2, "ERROR LECTOR");
      putText(1, 2, "REVISE RC522");
      if ((phase & 1U) == 0) {
        put(0, 0, '!');
        put(0, 15, '!');
      }
      break;
  }
}

bool copyActiveAccessFeedback(AccessFeedback& feedback, char* operatorName,
                              size_t operatorNameSize) {
  const int64_t nowUs = esp_timer_get_time();
  bool active = false;
  portENTER_CRITICAL(&accessFeedbackMux);
  if (accessFeedbackExpiresAtUs > nowUs) {
    feedback = activeAccessFeedback;
    if (operatorNameSize > 0) {
      strncpy(operatorName, activeOperatorName, operatorNameSize - 1);
      operatorName[operatorNameSize - 1] = '\0';
    }
    active = true;
  } else {
    accessFeedbackExpiresAtUs = 0;
  }
  portEXIT_CRITICAL(&accessFeedbackMux);
  return active;
}

// ------------------------------------------------------------------- Output
bool backBufferShows(uint8_t glyph) {
  for (uint8_t column = 0; column < config::kLcdColumns; ++column) {
    if (backBuffer[column] == static_cast<char>(glyph)) {
      return true;
    }
  }
  return false;
}

// Runs on the composed frame, so an icon that is currently blinked off or that
// belongs to another screen costs nothing. Scanning 32 bytes is far cheaper
// than the eight byte writes an unnecessary CGRAM upload would put on the bus.
void uploadAnimatedGlyphs() {
  if (backBufferShows(kGlyphHeater)) {
    const uint8_t frame = animationFrame % kHeaterFrames;
    if (frame != uploadedHeaterFrame) {
      lcdCreateChar(kGlyphHeater, kHeaterBitmaps[frame]);
      uploadedHeaterFrame = frame;
    }
  }
  if (backBufferShows(kGlyphFan)) {
    const uint8_t frame = animationFrame % kFanFrames;
    if (frame != uploadedFanFrame) {
      lcdCreateChar(kGlyphFan, kFanBitmaps[frame]);
      uploadedFanFrame = frame;
    }
  }
  if (backBufferShows(kGlyphAlarm)) {
    const uint8_t frame = animationFrame % kAlarmFrames;
    if (frame != uploadedAlarmFrame) {
      lcdCreateChar(kGlyphAlarm, kAlarmBitmaps[frame]);
      uploadedAlarmFrame = frame;
    }
  }
}

uint16_t rowFingerprint() {
  uint16_t value = 0xA5A5;
  for (uint8_t column = 0; column < config::kLcdColumns; ++column) {
    value = static_cast<uint16_t>((value << 5) | (value >> 11));
    value ^= static_cast<uint8_t>(backBuffer[column]);
    value = static_cast<uint16_t>(value + 0x9E37);
  }
  return value;
}

// Rewrites only rows whose composed contents changed. This uses 28 fewer SRAM
// bytes than cell-by-cell diffing and remains flicker-free because lcdClear()
// is never issued between frames.
void flush() {
  const uint16_t fingerprint = rowFingerprint();
  const uint8_t rowMask = static_cast<uint8_t>(1U << composingRow);
  if ((forcedRowsMask & rowMask) == 0 &&
      fingerprint == frontRowFingerprint[composingRow]) {
    return;
  }
  lcdSetCursor(0, composingRow);
  for (uint8_t column = 0; column < config::kLcdColumns; ++column) {
    lcdPrint(backBuffer[column]);
  }
  frontRowFingerprint[composingRow] = fingerprint;
  forcedRowsMask &= static_cast<uint8_t>(~rowMask);
}

}  // namespace

void invalidate() {
  forcedRowsMask = static_cast<uint8_t>((1U << config::kLcdRows) - 1U);
  uploadedHeaterFrame = 0xFF;
  uploadedFanFrame = 0xFF;
  uploadedAlarmFrame = 0xFF;
}

void showFatalRtos() {
  if (!lcdIsAvailable()) {
    return;
  }
  lcdSetBacklight(true);
  invalidate();
  for (uint8_t row = 0; row < config::kLcdRows; ++row) {
    composingRow = row;
    clearBackBuffer();
    putText(0, 0, "ERROR FATAL RTOS");
    putText(1, 0, "Sin RAM p/tareas");
    flush();
  }
}

void initialize() {
  if (!lcdIsAvailable()) {
    // Never attempt CGRAM writes when the backpack did not acknowledge during
    // hardware initialization. Each failed glyph would otherwise multiply the
    // TWI timeout and delay FreeRTOS/Serial startup substantially.
    return;
  }

  displayHardwareReady = true;
  composingRow = 0;
  invalidate();
  clearBackBuffer();

  lcdCreateChar(kGlyphThermometer, kThermometerBitmap);
  lcdCreateChar(kGlyphDroplet, kDropletBitmap);
  lcdCreateChar(kGlyphSlotFull, kSlotFullBitmap);
  lcdCreateChar(kGlyphSlotEmpty, kSlotEmptyBitmap);
  lcdCreateChar(kGlyphDoorOpen, kDoorOpenBitmap);
  lcdCreateChar(kGlyphHeater, kHeaterBitmaps[0]);
  lcdCreateChar(kGlyphFan, kFanBitmaps[0]);
  lcdCreateChar(kGlyphAlarm, kAlarmBitmaps[0]);

  // Splash: the title types itself in, the bottom row fills with eggs instead
  // of an anonymous progress bar, and then the whole clutch hatches. It runs
  // before the application tasks are created, so these delays cannot starve
  // either task.
  put(0, 1, static_cast<char>(kGlyphSlotFull));
  put(0, 14, static_cast<char>(kGlyphSlotFull));
  flush();

  static const char kTitle[] = "SmartEgg";
  for (uint8_t index = 0; index < sizeof(kTitle) - 1; ++index) {
    put(0, static_cast<uint8_t>(4 + index),
        kTitle[index]);
    flush();
    vTaskDelay(pdMS_TO_TICKS(config::kSplashLetterMs));
  }

  for (uint8_t column = 0; column < config::kLcdColumns; ++column) {
    composingRow = 1;
    if (column == 0) {
      clearBackBuffer();
    }
    put(1, column, static_cast<char>(kGlyphSlotFull));
    flush();
    vTaskDelay(pdMS_TO_TICKS(config::kSplashEggMs));
  }

  // Nothing in the frame buffer moves from here on: swapping the bitmap behind
  // the slot glyph hatches all eighteen eggs on the glass in eight byte writes.
  for (uint8_t frame = 1; frame < kHatchFrames; ++frame) {
    lcdCreateChar(kGlyphSlotFull, kHatchBitmaps[frame]);
    vTaskDelay(pdMS_TO_TICKS(config::kSplashHatchMs));
  }
  vTaskDelay(pdMS_TO_TICKS(config::kSplashHoldMs));

  // Hand the slot glyph back to the operational bitmap before the first render.
  lcdCreateChar(kGlyphSlotFull, kSlotFullBitmap);
  invalidate();
  for (uint8_t row = 0; row < config::kLcdRows; ++row) {
    composingRow = row;
    clearBackBuffer();
    flush();
  }
  currentScreen = Screen::kBoot;
}

void showAccessFeedback(AccessFeedback feedback, uint32_t durationMs) {
  const int64_t expiresAtUs =
      esp_timer_get_time() + static_cast<int64_t>(durationMs) * 1000LL;
  portENTER_CRITICAL(&accessFeedbackMux);
  activeAccessFeedback = feedback;
  activeOperatorName[0] = '\0';
  accessFeedbackExpiresAtUs = expiresAtUs;
  portEXIT_CRITICAL(&accessFeedbackMux);
}

void showAccessGranted(const char* operatorName, uint32_t durationMs) {
  const int64_t expiresAtUs =
      esp_timer_get_time() + static_cast<int64_t>(durationMs) * 1000LL;
  portENTER_CRITICAL(&accessFeedbackMux);
  activeAccessFeedback = AccessFeedback::kGranted;
  strncpy(activeOperatorName, operatorName, sizeof(activeOperatorName) - 1);
  activeOperatorName[sizeof(activeOperatorName) - 1] = '\0';
  accessFeedbackExpiresAtUs = expiresAtUs;
  portEXIT_CRITICAL(&accessFeedbackMux);
}

void render(const SystemState& state) {
  if (!displayHardwareReady) {
    return;
  }

  ++animationFrame;

  AccessFeedback accessFeedback = AccessFeedback::kReading;
  char operatorName[17] = {};
  const bool accessFeedbackActive = copyActiveAccessFeedback(
      accessFeedback, operatorName, sizeof(operatorName));

  Screen screen;
  if (accessFeedbackActive) {
    screen = Screen::kAccess;
  } else if (!state.systemEnabled) {
    screen = Screen::kDisabled;
  } else if (!state.sensorOk) {
    screen = Screen::kSensorFault;
  } else {
    screen = Screen::kRunning;
  }

  if (screen != currentScreen) {
    currentScreen = screen;
    marqueeOffset = 0;
    // Icons that belong to the outgoing screen may be stale in CGRAM.
    uploadedHeaterFrame = 0xFF;
    uploadedFanFrame = 0xFF;
    uploadedAlarmFrame = 0xFF;
  } else if (screen == Screen::kSensorFault &&
             (animationFrame % config::kMarqueeFrameDivider) == 0) {
    marqueeOffset =
        static_cast<uint8_t>((marqueeOffset + 1) % kFaultMarqueeLength);
  }

  for (uint8_t row = 0; row < config::kLcdRows; ++row) {
    composingRow = row;
    clearBackBuffer();
    switch (currentScreen) {
      case Screen::kDisabled:
        composeDisabled(state);
        break;
      case Screen::kSensorFault:
        composeSensorFault(state);
        break;
      case Screen::kAccess:
        composeAccessFeedback(accessFeedback, operatorName);
        break;
      default:
        composeRunning(state);
        break;
    }

    // The CGRAM bitmaps must land before the cells that reference them.
    uploadAnimatedGlyphs();
    flush();
  }
}

}  // namespace display
}  // namespace smartegg
