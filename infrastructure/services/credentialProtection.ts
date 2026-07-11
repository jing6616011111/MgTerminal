import { magiesTerminalBridge } from "./magiesTerminalBridge";

export const getCredentialProtectionAvailability = async (): Promise<boolean | null> => {
  const bridge = magiesTerminalBridge.get();
  if (!bridge?.credentialsAvailable) return null;

  try {
    return await bridge.credentialsAvailable();
  } catch {
    return null;
  }
};
