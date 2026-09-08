#pragma once

#include <esp_attr.h>

namespace smartegg {

bool createSmartEggTasks();
void IRAM_ATTR notifyPowerSwitchFromIsr();

}  // namespace smartegg
