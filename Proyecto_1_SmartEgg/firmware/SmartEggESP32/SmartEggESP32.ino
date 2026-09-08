#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#include <MFRC522.h>
#include <SPI.h>
#include <WiFi.h>
#include <Wire.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

namespace pins {
constexpr uint8_t kRfidSs = 5;
constexpr uint8_t kRfidRst = 4;
constexpr uint8_t kDht = 13;
constexpr uint8_t kHeaterRelay = 26;
constexpr uint8_t kFanRelay = 27;
constexpr uint8_t kBuzzer = 14;
constexpr uint8_t kTrayServo = 25;
constexpr uint8_t kAccessServo = 33;
constexpr uint8_t kDoor = 16;
constexpr uint8_t kPower = 17;
constexpr uint8_t kEggPressureSwitches[] = {32, 34, 35, 36};
constexpr size_t kEggSlotCount =
    sizeof(kEggPressureSwitches) / sizeof(kEggPressureSwitches[0]);
}  // namespace pins

namespace settings {
constexpr uint32_t kSerialBaud = 115200;
constexpr uint32_t kDhtPeriodMs = 2000;
constexpr uint32_t kTelemetryPeriodMs = 2000;
constexpr uint32_t kRotationPeriodMs = 120000;
constexpr uint32_t kDisplayPeriodMs = 500;
constexpr uint32_t kUnlockTimeoutMs = 15000;
constexpr uint32_t kRfidCooldownMs = 2000;
constexpr uint8_t kPressureStableSamples = 2;
constexpr uint8_t kTrayCenter = 90;
constexpr uint8_t kTrayOffset = 45;
constexpr uint8_t kAccessLocked = 0;
constexpr uint8_t kAccessUnlocked = 90;
constexpr bool kRelayActiveLow = true;
}  // namespace settings

DHT dht(pins::kDht, DHT11);
LiquidCrystal_I2C lcd(0x27, 16, 2);
MFRC522 rfid(pins::kRfidSs, pins::kRfidRst);
Servo trayServo;
Servo accessServo;

portMUX_TYPE stateMux = portMUX_INITIALIZER_UNLOCKED;

struct SystemState {
  float temperatureC = NAN;
  float humidityPct = NAN;
  bool doorOpen = false;
  bool heater = false;
  bool fan = false;
  bool buzzer = false;
  bool enabled = false;
  uint8_t occupiedSlots = 0;
  int trayAngle = settings::kTrayCenter;
};

SystemState state;
float temperatureMinC = 37.0F;
float temperatureMaxC = 38.0F;
float humidityMinPct = 50.0F;
float humidityMaxPct = 65.0F;
int8_t heaterOverride = -1;
int8_t fanOverride = -1;
int8_t buzzerOverride = -1;
int activeSessionId = 0;
bool accessDoorWasOpened = false;
uint32_t unlockedAtMs = 0;
uint32_t lastRfidAtMs = 0;
uint32_t lastDoorPostAtMs = 0;

void writeRelay(uint8_t pin, bool enabled) {
  digitalWrite(pin, settings::kRelayActiveLow ? !enabled : enabled);
}

String uidText() {
  String uid;
  uid.reserve(rfid.uid.size * 2);
  for (byte index = 0; index < rfid.uid.size; ++index) {
    if (rfid.uid.uidByte[index] < 0x10) uid += '0';
    uid += String(rfid.uid.uidByte[index], HEX);
  }
  uid.toUpperCase();
  return uid;
}

bool postJson(const String& path, JsonDocument& request, JsonDocument& response) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setTimeout(2500);
  http.begin(String(API_BASE_URL) + path);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  String body;
  serializeJson(request, body);
  const int statusCode = http.POST(body);
  if (statusCode >= 200 && statusCode < 300) {
    const DeserializationError error = deserializeJson(response, http.getString());
    http.end();
    return !error;
  }
  http.end();
  return false;
}

bool authorizeRfid(const String& uid) {
  JsonDocument request;
  JsonDocument response;
  request["uid"] = uid;
  request["incubator_code"] = INCUBATOR_CODE;
  if (!postJson("/api/v1/access/rfid/authorize", request, response)) return false;

  activeSessionId = response["session_id"] | 0;
  const int angle = response["servo_angle"] | settings::kAccessUnlocked;
  if (activeSessionId <= 0) return false;
  accessServo.write(constrain(angle, 0, 180));
  accessDoorWasOpened = false;
  unlockedAtMs = millis();
  return true;
}

bool postDoorState(bool open) {
  if (activeSessionId <= 0) return false;
  JsonDocument request;
  JsonDocument response;
  request["state"] = open ? "open" : "closed";
  const String path =
      "/api/v1/access/sessions/" + String(activeSessionId) + "/door";
  return postJson(path, request, response);
}

void cancelAccess() {
  bool cancelled = false;
  if (activeSessionId > 0) {
    JsonDocument request;
    JsonDocument response;
    const String path =
        "/api/v1/access/sessions/" + String(activeSessionId) + "/cancel";
    cancelled = postJson(path, request, response);
  }
  accessServo.write(settings::kAccessLocked);
  if (cancelled) {
    activeSessionId = 0;
    accessDoorWasOpened = false;
  } else {
    unlockedAtMs = millis();
  }
}

void maintainWifi() {
  static uint32_t lastAttemptMs = 0;
  if (WiFi.status() == WL_CONNECTED || millis() - lastAttemptMs < 5000) return;
  lastAttemptMs = millis();
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void readSerialCommand() {
  static String line;
  while (Serial.available()) {
    const char character = static_cast<char>(Serial.read());
    if (character == '\n') {
      JsonDocument command;
      if (!deserializeJson(command, line)) {
        const String type = command["type"] | "";
        if (type == "rotate") {
          const int requested = command["angle_degrees"] | 0;
          const int absoluteAngle =
              constrain(settings::kTrayCenter + requested, 0, 180);
          trayServo.write(absoluteAngle);
          portENTER_CRITICAL(&stateMux);
          state.trayAngle = absoluteAngle;
          portEXIT_CRITICAL(&stateMux);
        } else if (type == "config") {
          temperatureMinC = command["temperature_min_c"] | temperatureMinC;
          temperatureMaxC = command["temperature_max_c"] | temperatureMaxC;
          humidityMinPct = command["humidity_min_pct"] | humidityMinPct;
          humidityMaxPct = command["humidity_max_pct"] | humidityMaxPct;
        } else if (type == "actuator") {
          const String kind = command["kind"] | "";
          const String mode = command["mode"] | "automatic";
          const int8_t overrideValue =
              mode == "automatic" ? -1 : (command["enabled"] | false ? 1 : 0);
          if (kind == "heater") heaterOverride = overrideValue;
          if (kind == "fan") fanOverride = overrideValue;
          if (kind == "buzzer") buzzerOverride = overrideValue;
          if (kind == "servo" && !command["value"].isNull()) {
            const int requested = command["value"].as<int>();
            const int absoluteAngle =
                constrain(settings::kTrayCenter + requested, 0, 180);
            trayServo.write(absoluteAngle);
            portENTER_CRITICAL(&stateMux);
            state.trayAngle = absoluteAngle;
            portEXIT_CRITICAL(&stateMux);
          }
        }
      }
      line = "";
    } else if (character != '\r' && line.length() < 384) {
      line += character;
    }
  }
}

void publishTelemetry() {
  SystemState snapshot;
  portENTER_CRITICAL(&stateMux);
  snapshot = state;
  portEXIT_CRITICAL(&stateMux);
  if (isnan(snapshot.temperatureC) || isnan(snapshot.humidityPct)) return;

  JsonDocument message;
  message["incubator_code"] = INCUBATOR_CODE;
  message["temperature_c"] = snapshot.temperatureC;
  message["humidity_pct"] = snapshot.humidityPct;
  message["door_open"] = snapshot.doorOpen;
  message["occupied_slots"] = snapshot.occupiedSlots;
  message["heater"] = snapshot.heater;
  message["fan"] = snapshot.fan;
  message["servo_angle"] = snapshot.trayAngle - settings::kTrayCenter;
  message["buzzer"] = snapshot.buzzer;
  serializeJson(message, Serial);
  Serial.println();
}

void renderDisplay(const SystemState& snapshot) {
  char row[17];
  if (!snapshot.enabled) {
    lcd.setCursor(0, 0);
    lcd.print("SMART EGG  OFF  ");
    lcd.setCursor(0, 1);
    lcd.print("ACERCA TARJETA ");
    return;
  }
  snprintf(row, sizeof(row), "T%4.1f H%2.0f%% %c", snapshot.temperatureC,
           snapshot.humidityPct, snapshot.doorOpen ? 'D' : ' ');
  lcd.setCursor(0, 0);
  lcd.print(row);
  for (uint8_t index = strlen(row); index < 16; ++index) lcd.print(' ');
  snprintf(row, sizeof(row), "H%u F%u S%u/4 %c%c", snapshot.heater, snapshot.fan,
           snapshot.occupiedSlots, snapshot.buzzer ? '!' : ' ',
           activeSessionId > 0 ? 'U' : 'L');
  lcd.setCursor(0, 1);
  lcd.print(row);
  for (uint8_t index = strlen(row); index < 16; ++index) lcd.print(' ');
}

void controlTask(void*) {
  uint32_t lastDhtMs = 0;
  uint32_t lastRotationMs = 0;
  uint32_t lastDisplayMs = 0;
  bool rotateRight = true;
  bool stableEggPressed[pins::kEggSlotCount] = {};
  bool candidateEggPressed[pins::kEggSlotCount] = {};
  uint8_t candidateSamples[pins::kEggSlotCount] = {};
  for (;;) {
    const uint32_t now = millis();
    SystemState next;
    portENTER_CRITICAL(&stateMux);
    next = state;
    portEXIT_CRITICAL(&stateMux);
    next.enabled = digitalRead(pins::kPower) == LOW;
    next.doorOpen = digitalRead(pins::kDoor) == HIGH;
    next.occupiedSlots = 0;
    for (size_t index = 0; index < pins::kEggSlotCount; ++index) {
      const bool pressed =
          digitalRead(pins::kEggPressureSwitches[index]) == LOW;
      if (pressed == stableEggPressed[index]) {
        candidateEggPressed[index] = pressed;
        candidateSamples[index] = 0;
      } else if (pressed != candidateEggPressed[index]) {
        candidateEggPressed[index] = pressed;
        candidateSamples[index] = 1;
      } else if (++candidateSamples[index] >=
                 settings::kPressureStableSamples) {
        stableEggPressed[index] = pressed;
        candidateSamples[index] = 0;
      }
      if (stableEggPressed[index]) ++next.occupiedSlots;
    }

    if (now - lastDhtMs >= settings::kDhtPeriodMs) {
      lastDhtMs = now;
      const float humidity = dht.readHumidity();
      const float temperature = dht.readTemperature();
      if (!isnan(humidity) && !isnan(temperature)) {
        next.humidityPct = humidity;
        next.temperatureC = temperature;
      }
    }

    const bool sensorOk = !isnan(next.temperatureC) && !isnan(next.humidityPct);
    const bool critical = !sensorOk || next.temperatureC < temperatureMinC ||
                          next.temperatureC > temperatureMaxC ||
                          next.humidityPct < humidityMinPct ||
                          next.humidityPct > humidityMaxPct;
    const bool automaticHeat = next.temperatureC < temperatureMinC;
    const bool automaticFan = next.temperatureC > temperatureMaxC;
    next.heater = next.enabled && sensorOk && next.temperatureC < temperatureMaxC &&
                  (heaterOverride < 0 ? automaticHeat : heaterOverride == 1);
    next.fan = next.enabled && sensorOk &&
               (automaticFan || (fanOverride == 1));
    next.buzzer = next.enabled && (critical || buzzerOverride == 1);
    writeRelay(pins::kHeaterRelay, next.heater);
    writeRelay(pins::kFanRelay, next.fan);
    digitalWrite(pins::kBuzzer, next.buzzer);

    if (next.enabled && now - lastRotationMs >= settings::kRotationPeriodMs) {
      lastRotationMs = now;
      next.trayAngle = settings::kTrayCenter +
                       (rotateRight ? settings::kTrayOffset
                                    : -settings::kTrayOffset);
      rotateRight = !rotateRight;
      trayServo.write(next.trayAngle);
    }
    if (!next.enabled) {
      next.trayAngle = settings::kTrayCenter;
      trayServo.write(next.trayAngle);
    }

    portENTER_CRITICAL(&stateMux);
    state = next;
    portEXIT_CRITICAL(&stateMux);
    if (now - lastDisplayMs >= settings::kDisplayPeriodMs) {
      lastDisplayMs = now;
      renderDisplay(next);
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

void communicationTask(void*) {
  uint32_t lastTelemetryMs = 0;
  for (;;) {
    const uint32_t now = millis();
    maintainWifi();
    readSerialCommand();

    if (activeSessionId == 0 &&
        now - lastRfidAtMs >= settings::kRfidCooldownMs &&
        rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
      lastRfidAtMs = now;
      authorizeRfid(uidText());
      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();
    }

    const bool doorOpen = digitalRead(pins::kDoor) == HIGH;
    if (activeSessionId > 0 && doorOpen && !accessDoorWasOpened &&
        now - lastDoorPostAtMs >= 1000) {
      lastDoorPostAtMs = now;
      if (postDoorState(true)) {
        accessDoorWasOpened = true;
      }
    } else if (activeSessionId > 0 && !doorOpen && accessDoorWasOpened &&
               now - lastDoorPostAtMs >= 1000) {
      accessServo.write(settings::kAccessLocked);
      lastDoorPostAtMs = now;
      if (postDoorState(false)) {
        activeSessionId = 0;
        accessDoorWasOpened = false;
      }
    }

    if (activeSessionId > 0 && !accessDoorWasOpened &&
        now - unlockedAtMs >= settings::kUnlockTimeoutMs) {
      cancelAccess();
    }
    if (now - lastTelemetryMs >= settings::kTelemetryPeriodMs) {
      lastTelemetryMs = now;
      publishTelemetry();
    }
    vTaskDelay(pdMS_TO_TICKS(25));
  }
}

void setup() {
  Serial.begin(settings::kSerialBaud);
  pinMode(pins::kHeaterRelay, OUTPUT);
  pinMode(pins::kFanRelay, OUTPUT);
  pinMode(pins::kBuzzer, OUTPUT);
  pinMode(pins::kDoor, INPUT_PULLUP);
  pinMode(pins::kPower, INPUT_PULLUP);
  for (uint8_t pin : pins::kEggPressureSwitches) pinMode(pin, INPUT);
  writeRelay(pins::kHeaterRelay, false);
  writeRelay(pins::kFanRelay, false);
  digitalWrite(pins::kBuzzer, LOW);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  dht.begin();
  SPI.begin(18, 19, 23, pins::kRfidSs);
  rfid.PCD_Init();
  trayServo.setPeriodHertz(50);
  accessServo.setPeriodHertz(50);
  trayServo.attach(pins::kTrayServo, 500, 2400);
  accessServo.attach(pins::kAccessServo, 500, 2400);
  trayServo.write(settings::kTrayCenter);
  accessServo.write(settings::kAccessLocked);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  xTaskCreatePinnedToCore(controlTask, "control", 4096, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(communicationTask, "communication", 8192, nullptr, 1,
                          nullptr, 0);
}

void loop() {
  vTaskDelay(portMAX_DELAY);
}
