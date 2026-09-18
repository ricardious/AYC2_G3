#pragma once

#include <stdint.h>

namespace smartegg {

void initializeAccessControl();
void pollAccessControl();
void handleAccessAuthorization(bool authorized, int sessionId,
                               uint8_t servoAngle);
void handleAccessLock();

}  // namespace smartegg
