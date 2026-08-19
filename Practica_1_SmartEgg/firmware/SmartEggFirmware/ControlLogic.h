#pragma once

#include "SystemModel.h"

namespace smartegg {

bool isRuntimeConfigValid(const RuntimeConfig& runtimeConfig);

ActuatorDecision evaluateActuators(const SystemState& state,
                                   const RuntimeConfig& runtimeConfig,
                                   const ManualOverrides& overrides,
                                   const ActuatorDecision& previous);

int8_t clampRotationAngle(int16_t requestedAngle,
                          const RuntimeConfig& runtimeConfig);

}  // namespace smartegg
