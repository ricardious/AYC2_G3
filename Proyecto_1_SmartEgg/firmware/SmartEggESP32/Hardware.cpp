#include "Hardware.h"

#include <driver/gpio.h>
#include <driver/i2c_master.h>
#include <driver/ledc.h>
#include <driver/uart.h>
#include <esp_attr.h>
#include <esp_check.h>
#include <esp_err.h>
#include <esp_rom_sys.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

#include <cmath>
#include <cstdio>

#include "Config.h"
#include "Display.h"
#include "Tasks.h"

namespace smartegg {
namespace {

constexpr ledc_mode_t kServoSpeedMode = LEDC_LOW_SPEED_MODE;
constexpr ledc_timer_t kServoTimer = LEDC_TIMER_0;
constexpr ledc_timer_bit_t kServoResolution = LEDC_TIMER_16_BIT;
constexpr ledc_channel_t kTrayServoChannel = LEDC_CHANNEL_0;
constexpr ledc_channel_t kAccessServoChannel = LEDC_CHANNEL_1;
constexpr uint32_t kServoPeriodUs = 20000;
constexpr uint32_t kServoMinPulseUs = 500;
constexpr uint32_t kServoMaxPulseUs = 2400;

constexpr uint8_t kLcdEnable = 0x04;
constexpr uint8_t kLcdRegisterSelect = 0x01;
constexpr uint8_t kLcdBacklight = 0x08;

i2c_master_bus_handle_t i2cBus = nullptr;
i2c_master_dev_handle_t lcdDevice = nullptr;
bool lcdAvailable = false;
uint8_t lcdBacklightMask = kLcdBacklight;

portMUX_TYPE interruptMux = portMUX_INITIALIZER_UNLOCKED;
portMUX_TYPE dhtMux = portMUX_INITIALIZER_UNLOCKED;
volatile bool powerSwitchPending = false;
volatile bool powerSwitchRequestedOn = false;
volatile bool doorInterruptPending = false;

gpio_num_t gpio(uint8_t pin) { return static_cast<gpio_num_t>(pin); }

void configureOutput(uint8_t pin) {
  gpio_config_t settings = {};
  settings.pin_bit_mask = 1ULL << pin;
  settings.mode = GPIO_MODE_OUTPUT;
  settings.pull_up_en = GPIO_PULLUP_DISABLE;
  settings.pull_down_en = GPIO_PULLDOWN_DISABLE;
  settings.intr_type = GPIO_INTR_DISABLE;
  ESP_ERROR_CHECK(gpio_config(&settings));
}

void configureInput(uint8_t pin, bool pullUp, gpio_int_type_t interruptType) {
  gpio_config_t settings = {};
  settings.pin_bit_mask = 1ULL << pin;
  settings.mode = GPIO_MODE_INPUT;
  settings.pull_up_en = pullUp ? GPIO_PULLUP_ENABLE : GPIO_PULLUP_DISABLE;
  settings.pull_down_en = GPIO_PULLDOWN_DISABLE;
  settings.intr_type = interruptType;
  ESP_ERROR_CHECK(gpio_config(&settings));
}

void writeRelay(uint8_t pin, bool enabled) {
  const int activeLevel = config::kRelaysActiveLow ? 0 : 1;
  gpio_set_level(gpio(pin), enabled ? activeLevel : !activeLevel);
}

uint32_t servoDuty(uint8_t angleDegrees) {
  const uint32_t pulseUs = kServoMinPulseUs +
      (static_cast<uint32_t>(angleDegrees) *
       (kServoMaxPulseUs - kServoMinPulseUs)) / 180U;
  return static_cast<uint32_t>(
      (static_cast<uint64_t>(pulseUs) * ((1UL << 16) - 1)) /
      kServoPeriodUs);
}

void configureServoChannel(uint8_t pin, ledc_channel_t channel) {
  ledc_channel_config_t settings = {};
  settings.gpio_num = pin;
  settings.speed_mode = kServoSpeedMode;
  settings.channel = channel;
  settings.timer_sel = kServoTimer;
  settings.duty = servoDuty(90);
  settings.hpoint = 0;
  settings.sleep_mode = LEDC_SLEEP_MODE_NO_ALIVE_NO_PD;
  ESP_ERROR_CHECK(ledc_channel_config(&settings));
}

void initializeServos() {
  ledc_timer_config_t timer = {};
  timer.speed_mode = kServoSpeedMode;
  timer.duty_resolution = kServoResolution;
  timer.timer_num = kServoTimer;
  timer.freq_hz = 50;
  timer.clk_cfg = LEDC_AUTO_CLK;
  ESP_ERROR_CHECK(ledc_timer_config(&timer));
  configureServoChannel(config::kTrayServoPin, kTrayServoChannel);
  configureServoChannel(config::kAccessServoPin, kAccessServoChannel);
}

bool writePcf8574(uint8_t value) {
  if (!lcdAvailable || lcdDevice == nullptr) {
    return false;
  }
  const uint8_t output = static_cast<uint8_t>(value | lcdBacklightMask);
  if (i2c_master_transmit(lcdDevice, &output, 1, 20) != ESP_OK) {
    lcdAvailable = false;
    return false;
  }
  return true;
}

void pulseLcdEnable(uint8_t value) {
  writePcf8574(static_cast<uint8_t>(value | kLcdEnable));
  esp_rom_delay_us(1);
  writePcf8574(static_cast<uint8_t>(value & ~kLcdEnable));
  esp_rom_delay_us(50);
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
    esp_rom_delay_us(2000);
  }
}

// An external pull-up beats the internal pull-down, so this tells the bus wires
// apart from a floating pin without needing a meter.
bool hasExternalPullUp(uint8_t pin) {
  gpio_config_t settings = {};
  settings.pin_bit_mask = 1ULL << pin;
  settings.mode = GPIO_MODE_INPUT;
  settings.pull_up_en = GPIO_PULLUP_DISABLE;
  settings.pull_down_en = GPIO_PULLDOWN_ENABLE;
  settings.intr_type = GPIO_INTR_DISABLE;
  if (gpio_config(&settings) != ESP_OK) {
    return false;
  }
  esp_rom_delay_us(5000);
  const int level = gpio_get_level(gpio(pin));
  settings.pull_down_en = GPIO_PULLDOWN_DISABLE;
  gpio_config(&settings);
  return level == 1;
}

void reportI2cPins() {
  const bool sda = hasExternalPullUp(config::kI2cSdaPin);
  const bool scl = hasExternalPullUp(config::kI2cSclPin);
  char line[128];
  const int length = snprintf(
      line, sizeof(line),
      "DIAG:PINS,SDA_GPIO:%u,SDA_EXTPULL:%u,SCL_GPIO:%u,SCL_EXTPULL:%u\n",
      static_cast<unsigned>(config::kI2cSdaPin), sda ? 1U : 0U,
      static_cast<unsigned>(config::kI2cSclPin), scl ? 1U : 0U);
  if (length > 0) {
    const size_t bounded = static_cast<size_t>(length) < sizeof(line)
                               ? static_cast<size_t>(length)
                               : sizeof(line) - 1;
    uart_write_bytes(UART_NUM_0, line, bounded);
  }
}

// The LCD failing to answer is otherwise silent, so the bus scan travels with
// the protocol and names every address that replied.
void reportLcdDiagnostics() {
  char addresses[96];
  size_t used = 0;
  uint8_t found = 0;
  if (i2cBus != nullptr) {
    for (uint8_t address = 0x08; address <= 0x77; ++address) {
      if (i2c_master_probe(i2cBus, address, 20) != ESP_OK) {
        continue;
      }
      const int written =
          snprintf(addresses + used, sizeof(addresses) - used, "%s0x%02X",
                   found == 0 ? "" : ";", address);
      if (written > 0 &&
          static_cast<size_t>(written) < sizeof(addresses) - used) {
        used += static_cast<size_t>(written);
      }
      ++found;
    }
  }
  if (used == 0) {
    snprintf(addresses, sizeof(addresses), "none");
  }

  char line[192];
  const int length = snprintf(
      line, sizeof(line),
      "DIAG:I2C,FOUND:%u,ADDR:%s,EXPECTED:0x%02X,LCD:%u\n",
      static_cast<unsigned>(found), addresses,
      static_cast<unsigned>(config::kLcdAddress),
      lcdAvailable ? 1U : 0U);
  if (length > 0) {
    const size_t bounded = static_cast<size_t>(length) < sizeof(line)
                               ? static_cast<size_t>(length)
                               : sizeof(line) - 1;
    uart_write_bytes(UART_NUM_0, line, bounded);
  }
}

void initializeLcd() {
  reportI2cPins();
  i2c_master_bus_config_t busConfig = {};
  busConfig.i2c_port = 0;
  busConfig.sda_io_num = gpio(config::kI2cSdaPin);
  busConfig.scl_io_num = gpio(config::kI2cSclPin);
  busConfig.clk_source = I2C_CLK_SRC_DEFAULT;
  busConfig.glitch_ignore_cnt = 7;
  busConfig.flags.enable_internal_pullup = true;
  if (i2c_new_master_bus(&busConfig, &i2cBus) != ESP_OK) {
    i2cBus = nullptr;
    reportLcdDiagnostics();
    return;
  }
  if (i2c_master_probe(i2cBus, config::kLcdAddress, 100) != ESP_OK) {
    reportLcdDiagnostics();
    return;
  }

  i2c_device_config_t deviceConfig = {};
  deviceConfig.dev_addr_length = I2C_ADDR_BIT_LEN_7;
  deviceConfig.device_address = config::kLcdAddress;
  deviceConfig.scl_speed_hz = 100000;
  if (i2c_master_bus_add_device(i2cBus, &deviceConfig, &lcdDevice) != ESP_OK) {
    reportLcdDiagnostics();
    return;
  }
  lcdAvailable = true;
  vTaskDelay(pdMS_TO_TICKS(50));
  writeLcdNibble(0x30);
  esp_rom_delay_us(4500);
  writeLcdNibble(0x30);
  esp_rom_delay_us(4500);
  writeLcdNibble(0x30);
  esp_rom_delay_us(150);
  writeLcdNibble(0x20);
  lcdCommand(0x28);
  lcdCommand(0x0C);
  lcdCommand(0x06);
  lcdCommand(0x01);
  reportLcdDiagnostics();
}

uint32_t expectDhtPulse(int level) {
  const int64_t startUs = esp_timer_get_time();
  while (gpio_get_level(gpio(config::kDhtPin)) == level) {
    if (esp_timer_get_time() - startUs > 120) {
      return 0;
    }
  }
  return static_cast<uint32_t>(esp_timer_get_time() - startUs);
}

void IRAM_ATTR powerSwitchIsr(void*) {
  const bool requested = gpio_get_level(gpio(config::kPowerSwitchPin)) ==
                         config::kPowerSwitchOnLevel;
  portENTER_CRITICAL_ISR(&interruptMux);
  powerSwitchRequestedOn = requested;
  powerSwitchPending = true;
  portEXIT_CRITICAL_ISR(&interruptMux);
  notifyPowerSwitchFromIsr();
}

void IRAM_ATTR doorSwitchIsr(void*) {
  portENTER_CRITICAL_ISR(&interruptMux);
  doorInterruptPending = true;
  portEXIT_CRITICAL_ISR(&interruptMux);
}

}  // namespace

void initializeHardware() {
  configureInput(config::kPowerSwitchPin, true, GPIO_INTR_ANYEDGE);
  configureInput(config::kDoorSwitchPin, true, GPIO_INTR_ANYEDGE);
  configureInput(config::kDhtPin, true, GPIO_INTR_DISABLE);
  for (uint8_t index = 0; index < config::kSlotCount; ++index) {
    configureInput(config::kSlotPins[index], false, GPIO_INTR_DISABLE);
  }
  configureOutput(config::kHeaterRelayPin);
  configureOutput(config::kFanRelayPin);
  configureOutput(config::kBuzzerPin);
  configureOutput(config::kStatusLedPin);

  setHeater(false);
  setFan(false);
  setBuzzer(false);
  setStatusLed(false);
  initializeServos();
  setTrayAngle(0);
  setAccessAngle(config::kAccessLockedDegrees);
  initializeLcd();
  display::initialize();
}

void initializeInterrupts() {
  const esp_err_t installResult = gpio_install_isr_service(ESP_INTR_FLAG_IRAM);
  if (installResult != ESP_OK && installResult != ESP_ERR_INVALID_STATE) {
    ESP_ERROR_CHECK(installResult);
  }
  ESP_ERROR_CHECK(gpio_isr_handler_add(gpio(config::kPowerSwitchPin),
                                       powerSwitchIsr, nullptr));
  ESP_ERROR_CHECK(gpio_isr_handler_add(gpio(config::kDoorSwitchPin),
                                       doorSwitchIsr, nullptr));
}

void setHeater(bool enabled) {
  writeRelay(config::kHeaterRelayPin, enabled);
}

void setFan(bool enabled) { writeRelay(config::kFanRelayPin, enabled); }

void setBuzzer(bool enabled) {
  gpio_set_level(gpio(config::kBuzzerPin), enabled ? 1 : 0);
}

void setStatusLed(bool enabled) {
  gpio_set_level(gpio(config::kStatusLedPin), enabled ? 1 : 0);
}

void setTrayAngle(int8_t signedAngleDegrees) {
  const int16_t requested = static_cast<int16_t>(config::kServoCenterDegrees) +
                            signedAngleDegrees;
  ledc_set_duty_and_update(kServoSpeedMode, kTrayServoChannel,
                           servoDuty(static_cast<uint8_t>(
                               requested < 0 ? 0 :
                               (requested > 180 ? 180 : requested))), 0);
}

void setAccessAngle(uint8_t absoluteAngleDegrees) {
  const uint8_t angle = absoluteAngleDegrees > 180 ? 180 : absoluteAngleDegrees;
  ledc_set_duty_and_update(kServoSpeedMode, kAccessServoChannel,
                           servoDuty(angle), 0);
}

bool isDoorOpen() {
  return gpio_get_level(gpio(config::kDoorSwitchPin)) ==
         config::kDoorOpenLevel;
}

bool isPowerSwitchOn() {
  return gpio_get_level(gpio(config::kPowerSwitchPin)) ==
         config::kPowerSwitchOnLevel;
}

uint8_t countOccupiedSlots() {
  uint8_t occupied = 0;
  for (uint8_t index = 0; index < config::kSlotCount; ++index) {
    if (gpio_get_level(gpio(config::kSlotPins[index])) ==
        config::kSlotOccupiedLevel) {
      ++occupied;
    }
  }
  return occupied;
}

bool readDht(float& temperatureC, float& humidityPct) {
  uint8_t data[5] = {};
  gpio_set_direction(gpio(config::kDhtPin), GPIO_MODE_OUTPUT);
  gpio_set_level(gpio(config::kDhtPin), 0);
  vTaskDelay(pdMS_TO_TICKS(20));
  gpio_set_level(gpio(config::kDhtPin), 1);
  esp_rom_delay_us(30);
  gpio_set_direction(gpio(config::kDhtPin), GPIO_MODE_INPUT);

  bool valid = true;
  portENTER_CRITICAL(&dhtMux);
  if (expectDhtPulse(0) == 0 || expectDhtPulse(1) == 0) {
    valid = false;
  } else {
    for (uint8_t bit = 0; bit < 40; ++bit) {
      const uint32_t lowUs = expectDhtPulse(0);
      const uint32_t highUs = expectDhtPulse(1);
      if (lowUs == 0 || highUs == 0) {
        valid = false;
        break;
      }
      data[bit / 8] <<= 1;
      if (highUs > lowUs) {
        data[bit / 8] |= 1;
      }
    }
  }
  portEXIT_CRITICAL(&dhtMux);
  if (!valid || data[4] != static_cast<uint8_t>(data[0] + data[1] +
                                                data[2] + data[3])) {
    return false;
  }

  humidityPct = static_cast<float>(data[0]) + data[1] * 0.1F;
  temperatureC = static_cast<float>(data[2]) + (data[3] & 0x0F) * 0.1F;
  if ((data[3] & 0x80) != 0) {
    temperatureC = -temperatureC;
  }
  return humidityPct >= 0.0F && humidityPct <= 100.0F &&
         temperatureC >= -40.0F && temperatureC <= 80.0F;
}

bool takePowerSwitchRequest(bool& requestedOn) {
  portENTER_CRITICAL(&interruptMux);
  const bool pending = powerSwitchPending;
  if (pending) {
    requestedOn = powerSwitchRequestedOn;
    powerSwitchPending = false;
  }
  portEXIT_CRITICAL(&interruptMux);
  return pending;
}

bool takeDoorInterrupt() {
  portENTER_CRITICAL(&interruptMux);
  const bool pending = doorInterruptPending;
  doorInterruptPending = false;
  portEXIT_CRITICAL(&interruptMux);
  return pending;
}

void lcdCreateChar(uint8_t index, const uint8_t* bitmap) {
  lcdCommand(static_cast<uint8_t>(0x40 | ((index & 0x07) << 3)));
  for (uint8_t row = 0; row < 8; ++row) {
    sendLcdByte(bitmap[row], kLcdRegisterSelect);
  }
}

void lcdSetBacklight(bool enabled) {
  lcdBacklightMask = enabled ? kLcdBacklight : 0;
  writePcf8574(0);
}

bool lcdIsAvailable() { return lcdAvailable; }

void lcdClearRow(uint8_t row) {
  lcdSetCursor(0, row);
  lcdPrint("                ");
  lcdSetCursor(0, row);
}

void lcdSetCursor(uint8_t column, uint8_t row) {
  static const uint8_t rowOffsets[] = {0x00, 0x40};
  if (row >= config::kLcdRows) {
    row = config::kLcdRows - 1;
  }
  lcdCommand(static_cast<uint8_t>(0x80 | (column + rowOffsets[row])));
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
  snprintf(buffer, sizeof(buffer), "%d", value);
  lcdPrint(buffer);
}

void lcdPrint(float value, uint8_t decimals) {
  char format[8];
  char buffer[16];
  snprintf(format, sizeof(format), "%%.%uf", decimals);
  snprintf(buffer, sizeof(buffer), format, static_cast<double>(value));
  lcdPrint(buffer);
}

}  // namespace smartegg
