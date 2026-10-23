#pragma once

#include <stdint.h>

namespace smartegg {

void initializeHardware();
void initializeInterrupts();
void setHeater(bool enabled);
void setFan(bool enabled);
void setBuzzer(bool enabled);
void setStatusLed(bool enabled);
void setLockLed(bool enabled);
void setTrayAngle(int8_t signedAngleDegrees);
void setAccessAngle(uint8_t absoluteAngleDegrees);

bool isDoorOpen();
bool isPowerSwitchOn();
uint8_t countOccupiedSlots();
bool readDht(float& temperatureC, float& humidityPct);

bool takePowerSwitchRequest(bool& requestedOn);
bool takeDoorInterrupt();

void lcdClearRow(uint8_t row);
void lcdSetCursor(uint8_t column, uint8_t row);
void lcdCreateChar(uint8_t index, const uint8_t* bitmap);
void lcdSetBacklight(bool enabled);
bool lcdIsAvailable();
void lcdPrint(const char* text);
void lcdPrint(char value);
void lcdPrint(int16_t value);
void lcdPrint(float value, uint8_t decimals);

}  // namespace smartegg
