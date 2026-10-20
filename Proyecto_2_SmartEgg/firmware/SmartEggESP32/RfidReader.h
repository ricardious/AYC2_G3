#pragma once

#include <stddef.h>

namespace smartegg {

bool initializeRfidReader();
bool readRfidUid(char* output, size_t outputSize);

}  // namespace smartegg
