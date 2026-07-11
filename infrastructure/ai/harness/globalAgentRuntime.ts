import { AgentRuntime } from './agentRuntime';
import { magiesTerminalTurnDriver } from './turnDrivers/magiesTerminalTurnDriver';
import { externalSdkTurnDriver } from './turnDrivers/externalSdkTurnDriver';

export const globalAgentRuntime = new AgentRuntime({
  drivers: [magiesTerminalTurnDriver, externalSdkTurnDriver],
});

export function getAgentRuntime(): AgentRuntime {
  return globalAgentRuntime;
}
