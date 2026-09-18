#pragma once

#include "SystemModel.h"

namespace smartegg {

void initializeSerialProtocol();
void pollSerialCommands();
void emitProtocolFrame(MessageType type, uint8_t code,
                       const SystemState& state);
void emitRfidAccessRequest(const char* uid);
void emitDoorAccessEvent(int sessionId, bool open);
void emitAccessCancelEvent(int sessionId);

// Implemented by Tasks.cpp. SerialProtocol submits parsed commands and config
// updates without owning actuator logic.
bool submitControlCommand(const ControlCommand& command);
bool updateRuntimeConfig(const RuntimeConfig& runtimeConfig);
RuntimeConfig getRuntimeConfigSnapshot();
SystemState getSystemStateSnapshot();
void postProtocolMessage(MessageType type, uint8_t code);

}  // namespace smartegg
