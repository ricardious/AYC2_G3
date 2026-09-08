#include "AccessControl.h"

#include <esp_event.h>
#include <esp_http_client.h>
#include <esp_netif.h>
#include <esp_timer.h>
#include <esp_wifi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/event_groups.h>
#include <nvs_flash.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "Config.h"
#include "Hardware.h"
#include "RfidReader.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

namespace smartegg {
namespace {

constexpr EventBits_t kWifiConnectedBit = BIT0;
EventGroupHandle_t wifiEvents = nullptr;
int activeSessionId = 0;
bool doorWasOpened = false;
uint32_t unlockedAtMs = 0;
uint32_t lastRfidAtMs = 0;
uint32_t lastDoorPostAtMs = 0;

uint32_t milliseconds() {
  return static_cast<uint32_t>(esp_timer_get_time() / 1000ULL);
}

void wifiEventHandler(void*, esp_event_base_t eventBase, int32_t eventId,
                      void*) {
  if (eventBase == WIFI_EVENT && eventId == WIFI_EVENT_STA_START) {
    esp_wifi_connect();
  } else if (eventBase == WIFI_EVENT &&
             eventId == WIFI_EVENT_STA_DISCONNECTED) {
    xEventGroupClearBits(wifiEvents, kWifiConnectedBit);
    esp_wifi_connect();
  } else if (eventBase == IP_EVENT && eventId == IP_EVENT_STA_GOT_IP) {
    xEventGroupSetBits(wifiEvents, kWifiConnectedBit);
  }
}

bool initializeWifi() {
  esp_err_t result = nvs_flash_init();
  if (result == ESP_ERR_NVS_NO_FREE_PAGES ||
      result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    result = nvs_flash_init();
  }
  if (result != ESP_OK || esp_netif_init() != ESP_OK ||
      esp_event_loop_create_default() != ESP_OK) {
    return false;
  }
  wifiEvents = xEventGroupCreate();
  if (wifiEvents == nullptr || esp_netif_create_default_wifi_sta() == nullptr) {
    return false;
  }

  wifi_init_config_t initConfig = WIFI_INIT_CONFIG_DEFAULT();
  if (esp_wifi_init(&initConfig) != ESP_OK) {
    return false;
  }
  if (esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                 wifiEventHandler, nullptr) != ESP_OK ||
      esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                 wifiEventHandler, nullptr) != ESP_OK) {
    return false;
  }

  wifi_config_t station = {};
  snprintf(reinterpret_cast<char*>(station.sta.ssid), sizeof(station.sta.ssid),
           "%s", WIFI_SSID);
  snprintf(reinterpret_cast<char*>(station.sta.password),
           sizeof(station.sta.password), "%s", WIFI_PASSWORD);
  station.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
  station.sta.pmf_cfg.capable = true;
  station.sta.pmf_cfg.required = false;
  return esp_wifi_set_mode(WIFI_MODE_STA) == ESP_OK &&
         esp_wifi_set_config(WIFI_IF_STA, &station) == ESP_OK &&
         esp_wifi_start() == ESP_OK;
}

struct HttpResponse {
  char* data;
  size_t capacity;
  size_t length;
};

esp_err_t httpEventHandler(esp_http_client_event_t* event) {
  if (event->event_id != HTTP_EVENT_ON_DATA || event->data_len <= 0) {
    return ESP_OK;
  }
  auto* response = static_cast<HttpResponse*>(event->user_data);
  if (response == nullptr || response->capacity == 0) {
    return ESP_OK;
  }
  const size_t available = response->capacity - response->length - 1;
  const size_t received = static_cast<size_t>(event->data_len);
  const size_t toCopy = received < available ? received : available;
  if (toCopy > 0) {
    memcpy(response->data + response->length, event->data, toCopy);
    response->length += toCopy;
    response->data[response->length] = '\0';
  }
  return ESP_OK;
}

bool postJson(const char* path, const char* body, char* responseBuffer,
              size_t responseSize) {
  if (wifiEvents == nullptr ||
      (xEventGroupGetBits(wifiEvents) & kWifiConnectedBit) == 0) {
    return false;
  }
  char url[256];
  if (snprintf(url, sizeof(url), "%s%s", API_BASE_URL, path) >=
      static_cast<int>(sizeof(url))) {
    return false;
  }
  if (responseSize > 0) {
    responseBuffer[0] = '\0';
  }
  HttpResponse response = {responseBuffer, responseSize, 0};
  esp_http_client_config_t clientConfig = {};
  clientConfig.url = url;
  clientConfig.timeout_ms = config::kHttpTimeoutMs;
  clientConfig.event_handler = httpEventHandler;
  clientConfig.user_data = &response;
  esp_http_client_handle_t client = esp_http_client_init(&clientConfig);
  if (client == nullptr) {
    return false;
  }
  esp_http_client_set_method(client, HTTP_METHOD_POST);
  esp_http_client_set_header(client, "Content-Type", "application/json");
  esp_http_client_set_header(client, "X-Device-Key", DEVICE_API_KEY);
  esp_http_client_set_post_field(client, body, strlen(body));
  const esp_err_t result = esp_http_client_perform(client);
  const int statusCode = esp_http_client_get_status_code(client);
  esp_http_client_cleanup(client);
  return result == ESP_OK && statusCode >= 200 && statusCode < 300;
}

bool readIntegerField(const char* json, const char* fieldName, int& output) {
  const char* field = strstr(json, fieldName);
  if (field == nullptr) {
    return false;
  }
  field = strchr(field, ':');
  if (field == nullptr) {
    return false;
  }
  char* end = nullptr;
  const long parsed = strtol(field + 1, &end, 10);
  if (end == field + 1) {
    return false;
  }
  output = static_cast<int>(parsed);
  return true;
}

bool authorizeRfid(const char* uid) {
  char request[160];
  const int requestLength = snprintf(
      request, sizeof(request), "{\"uid\":\"%s\",\"incubator_code\":\"%s\"}",
      uid, INCUBATOR_CODE);
  if (requestLength < 0 || requestLength >= static_cast<int>(sizeof(request))) {
    return false;
  }
  char response[2048];
  const bool posted = postJson("/api/v1/access/rfid/authorize", request,
                               response, sizeof(response));
  if (!posted) {
    return false;
  }

  int sessionId = 0;
  int servoAngle = config::kAccessUnlockedDegrees;
  if (!readIntegerField(response, "\"session_id\"", sessionId)) {
    return false;
  }
  readIntegerField(response, "\"servo_angle\"", servoAngle);
  if (sessionId <= 0) {
    return false;
  }

  activeSessionId = sessionId;
  setAccessAngle(static_cast<uint8_t>(servoAngle < 0 ? 0 :
                                     (servoAngle > 180 ? 180 : servoAngle)));
  doorWasOpened = false;
  unlockedAtMs = milliseconds();
  return true;
}

bool postDoorState(bool open) {
  if (activeSessionId <= 0) {
    return false;
  }
  char path[96];
  snprintf(path, sizeof(path), "/api/v1/access/sessions/%d/door",
           activeSessionId);
  char response[1024];
  return postJson(path, open ? "{\"state\":\"open\"}"
                             : "{\"state\":\"closed\"}",
                  response, sizeof(response));
}

void cancelTimedOutAccess() {
  if (activeSessionId > 0) {
    char path[96];
    snprintf(path, sizeof(path), "/api/v1/access/sessions/%d/cancel",
             activeSessionId);
    char response[1024];
    postJson(path, "{}", response, sizeof(response));
  }
  setAccessAngle(config::kAccessLockedDegrees);
  activeSessionId = 0;
  doorWasOpened = false;
}

void pollRfid(uint32_t now) {
  if (activeSessionId != 0 ||
      now - lastRfidAtMs < config::kRfidCooldownMs) {
    return;
  }
  char uid[21];
  if (!readRfidUid(uid, sizeof(uid))) {
    return;
  }
  lastRfidAtMs = now;
  authorizeRfid(uid);
}

void pollDoorSession(uint32_t now) {
  if (activeSessionId <= 0 ||
      now - lastDoorPostAtMs < config::kDoorPostRetryMs) {
    return;
  }
  const bool doorOpen = isDoorOpen();
  if (doorOpen && !doorWasOpened) {
    lastDoorPostAtMs = now;
    if (postDoorState(true)) {
      doorWasOpened = true;
    }
  } else if (!doorOpen && doorWasOpened) {
    setAccessAngle(config::kAccessLockedDegrees);
    lastDoorPostAtMs = now;
    if (postDoorState(false)) {
      activeSessionId = 0;
      doorWasOpened = false;
    }
  }
}

}  // namespace

void initializeAccessControl() {
  initializeRfidReader();
  initializeWifi();
}

void pollAccessControl() {
  const uint32_t now = milliseconds();
  pollRfid(now);
  pollDoorSession(now);
  if (activeSessionId > 0 && !doorWasOpened &&
      now - unlockedAtMs >= config::kUnlockTimeoutMs) {
    cancelTimedOutAccess();
  }
}

}  // namespace smartegg
