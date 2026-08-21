#pragma once

#include <Arduino.h>
#include <Servo.h>

namespace smartegg {

extern Servo gTrayServo;

extern volatile bool gPowerSwitchRequestedOn;
extern volatile bool gDoorInterruptPending;

void initializeHardware();
void initializeInterrupts();
void setHeater(bool enabled);
void setFan(bool enabled);
void setBuzzer(bool enabled);
void setStatusLed(bool enabled);
void setTrayAngle(int8_t signedAngleDegrees);

bool isDoorOpen();
bool isPowerSwitchOn();
uint8_t countOccupiedSlots();
bool readDht(float& temperatureC, float& humidityPct);

void lcdClearRow(uint8_t row);
void lcdSetCursor(uint8_t column, uint8_t row);
// Loads one of the eight CGRAM glyphs from an 8-byte PROGMEM bitmap. Rewriting
// a slot redraws every cell already showing that code point, which is how the
// display layer animates icons without touching the frame buffer.
void lcdCreateChar(uint8_t index, const uint8_t* bitmapProgmem);
void lcdSetBacklight(bool enabled);
bool lcdIsAvailable();
void lcdPrint(const __FlashStringHelper* text);
void lcdPrint(const char* text);
void lcdPrint(char value);
void lcdPrint(int16_t value);
void lcdPrint(float value, uint8_t decimals);

void powerButtonIsr();
void doorSwitchIsr();

}  // namespace smartegg
