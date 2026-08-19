#include "Hardware.h"

#include <avr/io.h>
#include <avr/pgmspace.h>
#include <stdlib.h>

#include "Config.h"

namespace smartegg {

Servo gTrayServo;

volatile bool gPowerButtonInterruptPending = false;
volatile bool gDoorInterruptPending = false;

namespace {

constexpr uint8_t kLcdEnable = 0x04;
constexpr uint8_t kLcdRegisterSelect = 0x01;
constexpr uint8_t kLcdBacklight = 0x08;
constexpr uint16_t kTwiTimeoutIterations = 20000;
constexpr uint16_t kDhtPulseTimeoutLoops = 16000;

uint16_t expectDhtPulse(bool level, volatile uint8_t* inputRegister,
                        uint8_t bitMask) {
  uint16_t loops = 0;
  while (((*inputRegister & bitMask) != 0) == level) {
    if (++loops >= kDhtPulseTimeoutLoops) {
      return 0;
    }
  }
  return loops;
}

bool waitForTwi() {
  uint16_t remaining = kTwiTimeoutIterations;
  while (!(TWCR & _BV(TWINT)) && remaining > 0) {
    --remaining;
  }
  return remaining > 0;
}

bool writePcf8574(uint8_t value) {
  TWCR = _BV(TWINT) | _BV(TWSTA) | _BV(TWEN);
  if (!waitForTwi()) {
    return false;
  }
  TWDR = static_cast<uint8_t>(config::kLcdAddress << 1);
  TWCR = _BV(TWINT) | _BV(TWEN);
  if (!waitForTwi()) {
    return false;
  }
  TWDR = static_cast<uint8_t>(value | kLcdBacklight);
  TWCR = _BV(TWINT) | _BV(TWEN);
  const bool written = waitForTwi();
  TWCR = _BV(TWINT) | _BV(TWEN) | _BV(TWSTO);
  return written;
}

void pulseLcdEnable(uint8_t value) {
  writePcf8574(static_cast<uint8_t>(value | kLcdEnable));
  delayMicroseconds(1);
  writePcf8574(static_cast<uint8_t>(value & ~kLcdEnable));
  delayMicroseconds(50);
}

void writeLcdNibble(uint8_t value) {
  writePcf8574(value);
  pulseLcdEnable(value);
}

void sendLcdByte(uint8_t value, uint8_t mode) {
  writeLcdNibble(static_cast<uint8_t>((value & 0xF0) | mode));
  writeLcdNibble(static_cast<uint8_t>(((value << 4) & 0xF0) | mode));
}

void lcdCommand(uint8_t command) {
  sendLcdByte(command, 0);
  if (command == 0x01 || command == 0x02) {
    delayMicroseconds(2000);
  }
}

void initializeLcd() {
  // 100 kHz hardware TWI, prescaler 1.
  TWSR = 0;
  TWBR = static_cast<uint8_t>(((F_CPU / 100000UL) - 16UL) / 2UL);
  TWCR = _BV(TWEN);

  delay(50);
  writePcf8574(kLcdBacklight);
  writeLcdNibble(0x30);
  delayMicroseconds(4500);
  writeLcdNibble(0x30);
  delayMicroseconds(4500);
  writeLcdNibble(0x30);
  delayMicroseconds(150);
  writeLcdNibble(0x20);
  lcdCommand(0x28);  // 4-bit, 2 lines, 5x8 font.
  lcdCommand(0x0C);  // Display on, cursor off.
  lcdCommand(0x06);  // Left-to-right entry mode.
  lcdCommand(0x01);  // Clear.
}

void writeRelay(uint8_t pin, bool enabled) {
  const uint8_t activeLevel = config::kRelaysActiveLow ? LOW : HIGH;
  digitalWrite(pin, enabled ? activeLevel : !activeLevel);
}

}  // namespace

void initializeHardware() {
  pinMode(config::kPowerButtonPin, INPUT_PULLUP);
  pinMode(config::kDoorSwitchPin, INPUT_PULLUP);
  pinMode(config::kDhtPin, INPUT_PULLUP);
  pinMode(config::kHeaterRelayPin, OUTPUT);
  pinMode(config::kFanRelayPin, OUTPUT);
  pinMode(config::kBuzzerPin, OUTPUT);
  pinMode(config::kStatusLedPin, OUTPUT);

  for (uint8_t index = 0; index < config::kSlotCount; ++index) {
    pinMode(config::kSlotPins[index], INPUT_PULLUP);
  }

  // Force every potentially dangerous output off before starting tasks.
  setHeater(false);
  setFan(false);
  setBuzzer(false);
  setStatusLed(false);

  gTrayServo.attach(config::kServoPin);
  setTrayAngle(0);
  initializeLcd();
  lcdSetCursor(0, 0);
  lcdPrint(F("SmartEgg inicia"));

  attachInterrupt(digitalPinToInterrupt(config::kPowerButtonPin),
                  powerButtonIsr, FALLING);
  attachInterrupt(digitalPinToInterrupt(config::kDoorSwitchPin), doorSwitchIsr,
                  CHANGE);
}

void setHeater(bool enabled) {
  writeRelay(config::kHeaterRelayPin, enabled);
}

void setFan(bool enabled) { writeRelay(config::kFanRelayPin, enabled); }

void setBuzzer(bool enabled) {
  digitalWrite(config::kBuzzerPin, enabled ? HIGH : LOW);
}

void setStatusLed(bool enabled) {
  digitalWrite(config::kStatusLedPin, enabled ? HIGH : LOW);
}

void setTrayAngle(int8_t signedAngleDegrees) {
  int16_t absoluteAngle =
      static_cast<int16_t>(config::kServoCenterDegrees) + signedAngleDegrees;
  if (absoluteAngle < 0) {
    absoluteAngle = 0;
  } else if (absoluteAngle > 180) {
    absoluteAngle = 180;
  }
  gTrayServo.write(static_cast<uint8_t>(absoluteAngle));
}

bool isDoorOpen() {
  return digitalRead(config::kDoorSwitchPin) == config::kSwitchActiveLevel;
}

uint8_t countOccupiedSlots() {
  uint8_t occupied = 0;
  for (uint8_t index = 0; index < config::kSlotCount; ++index) {
    if (digitalRead(config::kSlotPins[index]) ==
        config::kSwitchActiveLevel) {
      ++occupied;
    }
  }
  return occupied;
}

bool readDht(float& temperatureC, float& humidityPct) {
  uint8_t data[5] = {0, 0, 0, 0, 0};
  pinMode(config::kDhtPin, OUTPUT);
  digitalWrite(config::kDhtPin, LOW);
  if (config::kDhtType == 11) {
    delay(20);
  } else {
    delayMicroseconds(1100);
  }
  pinMode(config::kDhtPin, INPUT_PULLUP);
  delayMicroseconds(55);

  const uint8_t bitMask = digitalPinToBitMask(config::kDhtPin);
  volatile uint8_t* inputRegister =
      portInputRegister(digitalPinToPort(config::kDhtPin));

  // The pulse train is timing-sensitive. The critical section is below 5 ms
  // and runs only once every 2 seconds; the scheduler resumes immediately.
  noInterrupts();
  if (expectDhtPulse(false, inputRegister, bitMask) == 0 ||
      expectDhtPulse(true, inputRegister, bitMask) == 0) {
    interrupts();
    return false;
  }
  for (uint8_t bitIndex = 0; bitIndex < 40; ++bitIndex) {
    const uint16_t lowCycles =
        expectDhtPulse(false, inputRegister, bitMask);
    const uint16_t highCycles =
        expectDhtPulse(true, inputRegister, bitMask);
    if (lowCycles == 0 || highCycles == 0) {
      interrupts();
      return false;
    }
    data[bitIndex / 8] <<= 1;
    if (highCycles > lowCycles) {
      data[bitIndex / 8] |= 1;
    }
  }
  interrupts();

  if (data[4] != static_cast<uint8_t>(data[0] + data[1] + data[2] +
                                      data[3])) {
    return false;
  }

  if (config::kDhtType == 11) {
    humidityPct = static_cast<float>(data[0]) + data[1] * 0.1F;
    temperatureC = static_cast<float>(data[2]) + (data[3] & 0x0F) * 0.1F;
    if ((data[3] & 0x80) != 0) {
      temperatureC = -temperatureC;
    }
  } else {
    const uint16_t rawHumidity =
        static_cast<uint16_t>(data[0]) << 8 | data[1];
    const uint16_t rawTemperature =
        static_cast<uint16_t>(data[2] & 0x7F) << 8 | data[3];
    humidityPct = rawHumidity * 0.1F;
    temperatureC = rawTemperature * 0.1F;
    if ((data[2] & 0x80) != 0) {
      temperatureC = -temperatureC;
    }
  }
  return humidityPct >= 0.0F && humidityPct <= 100.0F &&
         temperatureC >= -40.0F && temperatureC <= 80.0F;
}

void lcdClearRow(uint8_t row) {
  lcdSetCursor(0, row);
  lcdPrint(F("                "));
  lcdSetCursor(0, row);
}

void lcdSetCursor(uint8_t column, uint8_t row) {
  static const uint8_t rowOffsets[] = {0x00, 0x40};
  if (row >= config::kLcdRows) {
    row = static_cast<uint8_t>(config::kLcdRows - 1);
  }
  lcdCommand(static_cast<uint8_t>(0x80 | (column + rowOffsets[row])));
}

void lcdPrint(const __FlashStringHelper* text) {
  PGM_P cursor = reinterpret_cast<PGM_P>(text);
  char value = static_cast<char>(pgm_read_byte(cursor++));
  while (value != '\0') {
    lcdPrint(value);
    value = static_cast<char>(pgm_read_byte(cursor++));
  }
}

void lcdPrint(const char* text) {
  while (*text != '\0') {
    lcdPrint(*text++);
  }
}

void lcdPrint(char value) {
  sendLcdByte(static_cast<uint8_t>(value), kLcdRegisterSelect);
}

void lcdPrint(int16_t value) {
  char buffer[8];
  itoa(value, buffer, 10);
  lcdPrint(buffer);
}

void lcdPrint(float value, uint8_t decimals) {
  char buffer[10];
  dtostrf(value, 0, decimals, buffer);
  lcdPrint(buffer);
}

void powerButtonIsr() { gPowerButtonInterruptPending = true; }

void doorSwitchIsr() { gDoorInterruptPending = true; }

}  // namespace smartegg
