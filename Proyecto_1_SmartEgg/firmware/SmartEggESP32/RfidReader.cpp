#include "RfidReader.h"

#include <driver/gpio.h>
#include <driver/spi_master.h>
#include <esp_rom_sys.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

#include <cstdio>

#include "Config.h"

namespace smartegg {
namespace {

enum Register : uint8_t {
  kCommandReg = 0x01,
  kComIrqReg = 0x04,
  kDivIrqReg = 0x05,
  kErrorReg = 0x06,
  kFIFODataReg = 0x09,
  kFIFOLevelReg = 0x0A,
  kControlReg = 0x0C,
  kBitFramingReg = 0x0D,
  kCollReg = 0x0E,
  kModeReg = 0x11,
  kTxControlReg = 0x14,
  kTxASKReg = 0x15,
  kCRCResultRegH = 0x21,
  kCRCResultRegL = 0x22,
  kRFCfgReg = 0x26,
  kTModeReg = 0x2A,
  kTPrescalerReg = 0x2B,
  kTReloadRegH = 0x2C,
  kTReloadRegL = 0x2D,
  kVersionReg = 0x37,
};

enum Command : uint8_t {
  kIdle = 0x00,
  kCalcCrc = 0x03,
  kTransceive = 0x0C,
  kSoftReset = 0x0F,
};

spi_device_handle_t device = nullptr;
bool readerReady = false;

uint8_t readRegister(Register reg) {
  uint8_t tx[2] = {
      static_cast<uint8_t>(0x80 | ((static_cast<uint8_t>(reg) << 1) & 0x7E)),
      0,
  };
  uint8_t rx[2] = {};
  spi_transaction_t transaction = {};
  transaction.length = 16;
  transaction.tx_buffer = tx;
  transaction.rx_buffer = rx;
  if (spi_device_polling_transmit(device, &transaction) != ESP_OK) {
    return 0;
  }
  return rx[1];
}

void writeRegister(Register reg, uint8_t value) {
  const uint8_t tx[2] = {
      static_cast<uint8_t>((static_cast<uint8_t>(reg) << 1) & 0x7E),
      value,
  };
  spi_transaction_t transaction = {};
  transaction.length = 16;
  transaction.tx_buffer = tx;
  spi_device_polling_transmit(device, &transaction);
}

void setRegisterBits(Register reg, uint8_t mask) {
  writeRegister(reg, static_cast<uint8_t>(readRegister(reg) | mask));
}

void clearRegisterBits(Register reg, uint8_t mask) {
  writeRegister(reg, static_cast<uint8_t>(readRegister(reg) & ~mask));
}

bool calculateCrc(const uint8_t* data, size_t size, uint8_t result[2]) {
  writeRegister(kCommandReg, kIdle);
  writeRegister(kDivIrqReg, 0x04);
  writeRegister(kFIFOLevelReg, 0x80);
  for (size_t index = 0; index < size; ++index) {
    writeRegister(kFIFODataReg, data[index]);
  }
  writeRegister(kCommandReg, kCalcCrc);
  for (uint16_t attempt = 0; attempt < 5000; ++attempt) {
    if ((readRegister(kDivIrqReg) & 0x04) != 0) {
      writeRegister(kCommandReg, kIdle);
      result[0] = readRegister(kCRCResultRegL);
      result[1] = readRegister(kCRCResultRegH);
      return true;
    }
    esp_rom_delay_us(10);
  }
  writeRegister(kCommandReg, kIdle);
  return false;
}

bool communicate(const uint8_t* transmit, size_t transmitSize,
                 uint8_t validTransmitBits, uint8_t* receive,
                 size_t& receiveSize) {
  writeRegister(kCommandReg, kIdle);
  writeRegister(kComIrqReg, 0x7F);
  writeRegister(kFIFOLevelReg, 0x80);
  for (size_t index = 0; index < transmitSize; ++index) {
    writeRegister(kFIFODataReg, transmit[index]);
  }
  writeRegister(kBitFramingReg, validTransmitBits & 0x07);
  writeRegister(kCommandReg, kTransceive);
  setRegisterBits(kBitFramingReg, 0x80);

  bool completed = false;
  for (uint16_t attempt = 0; attempt < 4000; ++attempt) {
    const uint8_t irq = readRegister(kComIrqReg);
    if ((irq & 0x30) != 0) {
      completed = true;
      break;
    }
    if ((irq & 0x01) != 0) {
      break;
    }
    esp_rom_delay_us(10);
  }
  clearRegisterBits(kBitFramingReg, 0x80);
  if (!completed || (readRegister(kErrorReg) & 0x13) != 0) {
    return false;
  }

  const uint8_t available = readRegister(kFIFOLevelReg);
  if (available == 0 || available > receiveSize) {
    return false;
  }
  receiveSize = available;
  for (uint8_t index = 0; index < available; ++index) {
    receive[index] = readRegister(kFIFODataReg);
  }
  return true;
}

bool requestCard() {
  const uint8_t request = 0x26;
  uint8_t response[2] = {};
  size_t responseSize = sizeof(response);
  return communicate(&request, 1, 7, response, responseSize) &&
         responseSize == sizeof(response);
}

bool readCascadeLevel(uint8_t cascadeCode, uint8_t block[5]) {
  writeRegister(kCollReg, 0x80);
  const uint8_t anticollision[] = {cascadeCode, 0x20};
  size_t responseSize = 5;
  if (!communicate(anticollision, sizeof(anticollision), 0, block,
                   responseSize) || responseSize != 5) {
    return false;
  }
  const uint8_t checksum = static_cast<uint8_t>(
      block[0] ^ block[1] ^ block[2] ^ block[3]);
  return checksum == block[4];
}

bool selectCascadeLevel(uint8_t cascadeCode, const uint8_t block[5],
                        uint8_t& sak) {
  uint8_t frame[9] = {cascadeCode, 0x70, block[0], block[1], block[2],
                      block[3], block[4], 0, 0};
  if (!calculateCrc(frame, 7, &frame[7])) {
    return false;
  }
  uint8_t response[3] = {};
  size_t responseSize = sizeof(response);
  if (!communicate(frame, sizeof(frame), 0, response, responseSize) ||
      responseSize != sizeof(response)) {
    return false;
  }
  uint8_t expectedCrc[2];
  if (!calculateCrc(response, 1, expectedCrc) ||
      response[1] != expectedCrc[0] || response[2] != expectedCrc[1]) {
    return false;
  }
  sak = response[0];
  return true;
}

bool readUid(uint8_t uid[10], size_t& uidSize) {
  constexpr uint8_t kCascadeCodes[] = {0x93, 0x95, 0x97};
  uidSize = 0;
  for (uint8_t cascadeCode : kCascadeCodes) {
    uint8_t block[5];
    if (!readCascadeLevel(cascadeCode, block)) {
      return false;
    }

    const bool hasCascadeTag = block[0] == 0x88;
    const size_t firstUidByte = hasCascadeTag ? 1 : 0;
    const size_t bytesAtLevel = hasCascadeTag ? 3 : 4;
    if (uidSize + bytesAtLevel > 10) {
      return false;
    }
    for (size_t index = 0; index < bytesAtLevel; ++index) {
      uid[uidSize++] = block[firstUidByte + index];
    }

    uint8_t sak = 0;
    if (!selectCascadeLevel(cascadeCode, block, sak)) {
      return false;
    }
    const bool moreLevels = (sak & 0x04) != 0;
    if (!moreLevels) {
      return !hasCascadeTag;
    }
    if (!hasCascadeTag) {
      return false;
    }
  }
  return false;
}

void haltCard() {
  uint8_t frame[4] = {0x50, 0x00, 0, 0};
  if (calculateCrc(frame, 2, &frame[2])) {
    uint8_t ignored[1];
    size_t ignoredSize = sizeof(ignored);
    communicate(frame, sizeof(frame), 0, ignored, ignoredSize);
  }
}

}  // namespace

bool initializeRfidReader() {
  gpio_config_t resetConfig = {};
  resetConfig.pin_bit_mask = 1ULL << config::kRfidRstPin;
  resetConfig.mode = GPIO_MODE_OUTPUT;
  if (gpio_config(&resetConfig) != ESP_OK) {
    return false;
  }
  gpio_set_level(static_cast<gpio_num_t>(config::kRfidRstPin), 0);
  vTaskDelay(pdMS_TO_TICKS(2));
  gpio_set_level(static_cast<gpio_num_t>(config::kRfidRstPin), 1);
  vTaskDelay(pdMS_TO_TICKS(50));

  spi_bus_config_t bus = {};
  bus.mosi_io_num = config::kSpiMosiPin;
  bus.miso_io_num = config::kSpiMisoPin;
  bus.sclk_io_num = config::kSpiSckPin;
  bus.quadwp_io_num = -1;
  bus.quadhd_io_num = -1;
  bus.max_transfer_sz = 16;
  if (spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_DISABLED) != ESP_OK) {
    return false;
  }

  spi_device_interface_config_t interfaceConfig = {};
  interfaceConfig.clock_speed_hz = 4 * 1000 * 1000;
  interfaceConfig.mode = 0;
  interfaceConfig.spics_io_num = config::kRfidSsPin;
  interfaceConfig.queue_size = 1;
  if (spi_bus_add_device(SPI2_HOST, &interfaceConfig, &device) != ESP_OK) {
    return false;
  }

  writeRegister(kCommandReg, kSoftReset);
  vTaskDelay(pdMS_TO_TICKS(50));
  writeRegister(kTModeReg, 0x80);
  writeRegister(kTPrescalerReg, 0xA9);
  writeRegister(kTReloadRegH, 0x03);
  writeRegister(kTReloadRegL, 0xE8);
  writeRegister(kTxASKReg, 0x40);
  writeRegister(kModeReg, 0x3D);
  writeRegister(kRFCfgReg, 0x70);
  setRegisterBits(kTxControlReg, 0x03);

  const uint8_t version = readRegister(kVersionReg);
  readerReady = version != 0x00 && version != 0xFF;
  return readerReady;
}

bool readRfidUid(char* output, size_t outputSize) {
  if (!readerReady || output == nullptr || outputSize < 9 || !requestCard()) {
    return false;
  }
  uint8_t uid[10];
  size_t uidSize = 0;
  if (!readUid(uid, uidSize) || outputSize < uidSize * 2 + 1) {
    return false;
  }
  for (size_t index = 0; index < uidSize; ++index) {
    snprintf(output + index * 2, outputSize - index * 2, "%02X", uid[index]);
  }
  haltCard();
  return true;
}

}  // namespace smartegg
