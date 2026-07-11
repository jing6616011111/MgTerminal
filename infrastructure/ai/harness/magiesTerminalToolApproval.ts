import type { ToolApprovalConfiguration } from 'ai';
import type { AIPermissionMode } from '../types';
import { requestApproval as defaultRequestApproval } from '../shared/approvalGate';
import { resolveCapabilityId } from './permissionGrants';
import magiesTerminalToolSpecs from './generated/magiesTerminalToolSpecs.json';

type MagiesTerminalToolPolicySpec = {
  toolName: string;
  capabilityId: string;
  policy: {
    write: boolean;
    bypassesApproval: boolean;
    bypassesObserverBlock?: boolean;
  };
};

const policyByToolName = new Map<string, MagiesTerminalToolPolicySpec>(
  (magiesTerminalToolSpecs as MagiesTerminalToolPolicySpec[]).map((spec) => [spec.toolName, spec]),
);

function needsUserApproval(
  toolName: string,
  permissionMode: AIPermissionMode,
): boolean {
  if (permissionMode !== 'confirm') return false;
  const spec = policyByToolName.get(toolName);
  if (!spec) return false;
  return spec.policy.write && !spec.policy.bypassesApproval;
}

export function buildMagiesTerminalToolApproval(input: {
  permissionMode: AIPermissionMode;
  chatSessionId?: string;
  requestApproval?: typeof defaultRequestApproval;
}): ToolApprovalConfiguration<Record<string, never>, import('./magiesTerminalRuntimeContext').MagiesTerminalRuntimeContext> {
  const { permissionMode, chatSessionId, requestApproval = defaultRequestApproval } = input;

  return async ({ toolCall }) => {
    const spec = policyByToolName.get(toolCall.toolName);
    if (!spec?.policy.write) {
      return undefined;
    }

    if (permissionMode === 'observer' && !spec.policy.bypassesObserverBlock) {
      return { type: 'denied' as const, reason: 'Observer mode blocks write operations.' };
    }

    if (!needsUserApproval(toolCall.toolName, permissionMode)) {
      return undefined;
    }

    const args = (toolCall.input ?? {}) as Record<string, unknown>;
    const approved = await requestApproval(
      toolCall.toolCallId,
      toolCall.toolName,
      args,
      chatSessionId,
      undefined,
      spec.capabilityId ?? resolveCapabilityId(toolCall.toolName),
    );

    if (approved) {
      return { type: 'approved' as const };
    }
    return { type: 'denied' as const, reason: 'User denied tool execution.' };
  };
}
