import { magiesTerminalBridge } from '../../infrastructure/services/magiesTerminalBridge';

export async function writeSystemManagerDiagnostic(
  message: string,
  extra?: Record<string, unknown>,
) {
  try {
    await magiesTerminalBridge.get()?.logDiagnostic?.({
      source: 'system-manager',
      message,
      extra,
    });
  } catch {
    // Diagnostics must never block the user action being diagnosed.
  }
}
