#include <driver/uart.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

#include <cstring>

#include "AccessControl.h"
#include "Display.h"
#include "Hardware.h"
#include "SerialProtocol.h"
#include "Tasks.h"

extern "C" void app_main() {
  smartegg::initializeSerialProtocol();
  smartegg::initializeHardware();
  smartegg::initializeAccessControl();

  if (!smartegg::createSmartEggTasks()) {
    smartegg::setHeater(false);
    smartegg::setFan(false);
    smartegg::setBuzzer(false);
    smartegg::display::showFatalRtos();
    constexpr char error[] = "MSG:4,ERROR:6,SENSOR:0\n";
    uart_write_bytes(UART_NUM_0, error, strlen(error));
    smartegg::setStatusLed(true);
    for (;;) {
      vTaskDelay(portMAX_DELAY);
    }
  }
  smartegg::initializeInterrupts();
}
