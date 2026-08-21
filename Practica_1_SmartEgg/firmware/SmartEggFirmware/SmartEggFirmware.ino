// SmartEgg — Arduino Uno R3 + FreeRTOS
// Arduino_FreeRTOS.h must be included first for the AVR port.
#include <Arduino_FreeRTOS.h>

#include "Config.h"
#include "Display.h"
#include "Hardware.h"
#include "SerialProtocol.h"
#include "Tasks.h"

void setup() {
  smartegg::initializeSerialProtocol();
  smartegg::initializeHardware();

  if (!smartegg::createSmartEggTasks()) {
    // Task allocation failed. Keep all actuators safe and expose a visible
    // fatal pattern; setup intentionally does not return to a partial system.
    smartegg::setHeater(false);
    smartegg::setFan(false);
    smartegg::setBuzzer(false);
    smartegg::display::showFatalRtos();
    Serial.println(F("MSG:4,ERROR:6,SENSOR:0"));
    smartegg::setStatusLed(true);
    for (;;) {
      // Do not start a partially allocated scheduler.
    }
  }
  smartegg::initializeInterrupts();
}

void loop() {
  // FreeRTOS owns all application work. Keeping loop() empty is intentional.
}
