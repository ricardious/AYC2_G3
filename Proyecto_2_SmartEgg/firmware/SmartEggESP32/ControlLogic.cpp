#include "ControlLogic.h"

#include "Config.h"

namespace smartegg {

namespace {

bool resolveOverride(int8_t mode, bool automaticValue) {
  if (mode < 0) {
    return automaticValue;
  }
  return mode > 0;
}

}  // namespace

bool isRuntimeConfigValid(const RuntimeConfig& runtimeConfig) {
  return runtimeConfig.temperatureMinC < runtimeConfig.temperatureMaxC &&
         runtimeConfig.humidityMinPct < runtimeConfig.humidityMaxPct &&
         runtimeConfig.humidityMinPct >= 0.0F &&
         runtimeConfig.humidityMaxPct <= 100.0F &&
         runtimeConfig.rotationIntervalMs >= 10000UL &&
         runtimeConfig.rotationAngleDegrees > 0 &&
         runtimeConfig.rotationAngleDegrees <= 90;
}

ActuatorDecision evaluateActuators(const SystemState& state,
                                   const RuntimeConfig& runtimeConfig,
                                   const ManualOverrides& overrides,
                                   const ActuatorDecision& previous) {
  ActuatorDecision result = {false, false, false};
  if (!state.systemEnabled) {
    return result;
  }

  const bool sensorAlarm =
      !state.sensorOk && state.consecutiveDhtFailures >=
                             config::kMaxConsecutiveDhtFailures;
  if (!state.hasValidReading || !state.sensorOk) {
    result.buzzerOn = sensorAlarm || overrides.buzzer > 0;
    return result;
  }

  bool heaterAutomatic = previous.heaterOn;
  if (state.temperatureC < runtimeConfig.temperatureMinC) {
    heaterAutomatic = true;
  } else if (state.temperatureC >=
             runtimeConfig.temperatureMinC +
                 config::kTemperatureHysteresisC) {
    heaterAutomatic = false;
  }

  bool fanAutomatic = previous.fanOn;
  if (state.temperatureC > runtimeConfig.temperatureMaxC) {
    fanAutomatic = true;
  } else if (state.temperatureC <=
             runtimeConfig.temperatureMaxC -
                 config::kTemperatureHysteresisC) {
    fanAutomatic = false;
  }

  const bool environmentAlarm =
      state.temperatureC < runtimeConfig.temperatureMinC ||
      state.temperatureC > runtimeConfig.temperatureMaxC ||
      state.humidityPct < runtimeConfig.humidityMinPct ||
      state.humidityPct > runtimeConfig.humidityMaxPct;

  result.heaterOn = resolveOverride(overrides.heater, heaterAutomatic);
  result.fanOn = resolveOverride(overrides.fan, fanAutomatic);
  result.buzzerOn = environmentAlarm || overrides.buzzer > 0;

  // Safety always wins over a manual command from the computer.
  if (state.temperatureC >= runtimeConfig.temperatureMaxC) {
    result.heaterOn = false;
    result.fanOn = true;
  }
  return result;
}

int8_t clampRotationAngle(int16_t requestedAngle,
                          const RuntimeConfig& runtimeConfig) {
  const int16_t limit = runtimeConfig.rotationAngleDegrees;
  if (requestedAngle > limit) {
    return static_cast<int8_t>(limit);
  }
  if (requestedAngle < -limit) {
    return static_cast<int8_t>(-limit);
  }
  return static_cast<int8_t>(requestedAngle);
}

}  // namespace smartegg
