#include "AccessControl.h"

#include <esp_timer.h>

#include "Config.h"
#include "Display.h"
#include "Hardware.h"
#include "RfidReader.h"
#include "SerialProtocol.h"

namespace smartegg {
namespace {

int activeSessionId = 0;
bool authorizationPending = false;
bool doorWasOpened = false;
bool doorStableOpen = false;
bool doorLastReading = false;
uint32_t doorReadingSinceMs = 0;
uint32_t unlockedAtMs = 0;
uint32_t doorOpenedAtMs = 0;
uint32_t lastRfidAtMs = 0;
uint32_t authorizationRequestedAtMs = 0;

uint32_t milliseconds() {
  return static_cast<uint32_t>(esp_timer_get_time() / 1000ULL);
}

void pollRfid(uint32_t now) {
  if (activeSessionId != 0 || authorizationPending ||
      now - lastRfidAtMs < config::kRfidCooldownMs) {
    return;
  }
  char uid[21];
  if (!readRfidUid(uid, sizeof(uid))) {
    return;
  }
  lastRfidAtMs = now;
  authorizationPending = true;
  authorizationRequestedAtMs = now;
  display::showAccessFeedback(display::AccessFeedback::kReading,
                              config::kAccessAuthorizationTimeoutMs);
  emitRfidAccessRequest(uid);
}

void expirePendingAuthorization(uint32_t now) {
  if (!authorizationPending ||
      now - authorizationRequestedAtMs <
          config::kAccessAuthorizationTimeoutMs) {
    return;
  }
  authorizationPending = false;
  setAccessAngle(config::kAccessLockedDegrees);
  display::showAccessFeedback(display::AccessFeedback::kTimeout, 2500);
}

// The switch bounces when the door moves; a change only counts after it holds
// for kDoorDebounceMs.
bool debouncedDoorOpen(uint32_t now) {
  const bool reading = isDoorOpen();
  if (reading != doorLastReading) {
    doorLastReading = reading;
    doorReadingSinceMs = now;
  } else if (reading != doorStableOpen &&
             now - doorReadingSinceMs >= config::kDoorDebounceMs) {
    doorStableOpen = reading;
  }
  return doorStableOpen;
}

void endSession() {
  setAccessAngle(config::kAccessLockedDegrees);
  activeSessionId = 0;
  doorWasOpened = false;
}

void pollDoorSession(uint32_t now) {
  const bool doorOpen = debouncedDoorOpen(now);
  if (activeSessionId <= 0) {
    return;
  }

  if (doorOpen && !doorWasOpened) {
    doorWasOpened = true;
    doorOpenedAtMs = now;
    emitDoorAccessEvent(activeSessionId, true);
    return;
  }
  if (!doorOpen && doorWasOpened) {
    emitDoorAccessEvent(activeSessionId, false);
    endSession();
    return;
  }
  const bool unlockExpired =
      !doorWasOpened && now - unlockedAtMs >= config::kUnlockTimeoutMs;
  // The close was never detected: free the reader instead of ignoring every
  // card until the ESP32 restarts.
  const bool doorOpenExpired =
      doorWasOpened && now - doorOpenedAtMs >= config::kDoorOpenTimeoutMs;
  if (unlockExpired || doorOpenExpired) {
    const int timedOutSessionId = activeSessionId;
    endSession();
    emitAccessCancelEvent(timedOutSessionId);
  }
}

}  // namespace

void initializeAccessControl() {
  doorLastReading = isDoorOpen();
  doorStableOpen = doorLastReading;
  if (!initializeRfidReader()) {
    display::showAccessFeedback(display::AccessFeedback::kReaderError, 5000);
  }
}

void pollAccessControl() {
  const uint32_t now = milliseconds();
  expirePendingAuthorization(now);
  pollRfid(now);
  pollDoorSession(now);
}

void handleAccessAuthorization(bool authorized, int sessionId,
                               uint8_t servoAngle, const char* operatorName) {
  if (!authorizationPending) {
    return;
  }
  authorizationPending = false;
  if (!authorized || sessionId <= 0) {
    setAccessAngle(config::kAccessLockedDegrees);
    display::showAccessFeedback(display::AccessFeedback::kDenied, 2500);
    return;
  }

  activeSessionId = sessionId;
  doorWasOpened = false;
  unlockedAtMs = milliseconds();
  setAccessAngle(servoAngle);
  display::showAccessGranted(operatorName, 5000);
}

void handleAccessLock() {
  setAccessAngle(config::kAccessLockedDegrees);
  activeSessionId = 0;
  authorizationPending = false;
  doorWasOpened = false;
}

}  // namespace smartegg
