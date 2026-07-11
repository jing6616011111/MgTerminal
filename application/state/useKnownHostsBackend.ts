import { useCallback } from "react";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

export const useKnownHostsBackend = () => {
  const readKnownHosts = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    return bridge?.readKnownHosts?.();
  }, []);

  return { readKnownHosts };
};

