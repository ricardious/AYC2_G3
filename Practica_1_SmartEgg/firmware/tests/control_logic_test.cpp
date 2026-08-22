#include <assert.h>

#include "ControlLogic.h"

namespace {

smartegg::RuntimeConfig validConfig() {
  return {37.0F, 38.0F, 50.0F, 65.0F, 120000UL, 45};
}

smartegg::SystemState normalState() {
  return {37.5F, 58.0F, true, true, true, false, 3, 0,
          false, false, false, 0};
}

}  // namespace

int main() {
  using smartegg::ActuatorDecision;
  using smartegg::ManualOverrides;

  const smartegg::RuntimeConfig config = validConfig();
  assert(smartegg::isRuntimeConfigValid(config));
  smartegg::RuntimeConfig invalid = config;
  invalid.temperatureMinC = invalid.temperatureMaxC;
  assert(!smartegg::isRuntimeConfigValid(invalid));

  smartegg::SystemState state = normalState();
  const ManualOverrides automatic = {-1, -1, -1};
  const ActuatorDecision allOff = {false, false, false};

  state.temperatureC = 36.8F;
  ActuatorDecision decision =
      smartegg::evaluateActuators(state, config, automatic, allOff);
  assert(decision.heaterOn);
  assert(!decision.fanOn);
  assert(decision.buzzerOn);

  state.temperatureC = 38.5F;
  decision = smartegg::evaluateActuators(state, config, automatic, allOff);
  assert(!decision.heaterOn);
  assert(decision.fanOn);
  assert(decision.buzzerOn);

  state = normalState();
  state.humidityPct = 70.0F;
  decision = smartegg::evaluateActuators(state, config, automatic, allOff);
  assert(decision.buzzerOn);

  state = normalState();
  state.systemEnabled = false;
  const ManualOverrides forcedOn = {1, 1, 1};
  decision = smartegg::evaluateActuators(state, config, forcedOn, allOff);
  assert(!decision.heaterOn && !decision.fanOn && !decision.buzzerOn);

  state = normalState();
  state.temperatureC = 38.2F;
  const ManualOverrides unsafeManual = {1, 0, 0};
  decision = smartegg::evaluateActuators(state, config, unsafeManual, allOff);
  assert(!decision.heaterOn);
  assert(decision.fanOn);
  assert(decision.buzzerOn);

  state = normalState();
  state.sensorOk = false;
  state.consecutiveDhtFailures = 3;
  decision = smartegg::evaluateActuators(state, config, automatic, allOff);
  assert(!decision.heaterOn && !decision.fanOn && decision.buzzerOn);

  assert(smartegg::clampRotationAngle(80, config) == 45);
  assert(smartegg::clampRotationAngle(-80, config) == -45);
  assert(smartegg::clampRotationAngle(30, config) == 30);
  return 0;
}
