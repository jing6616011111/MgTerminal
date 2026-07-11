import { useCallback } from "react";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

export const useTrayPanelBackend = () => {
  const hideTrayPanel = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    await bridge?.hideTrayPanel?.();
  }, []);

  const openMainWindow = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    await bridge?.openMainWindow?.();
  }, []);

  const quitApp = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    await bridge?.quitApp?.();
  }, []);

  const jumpToSession = useCallback(async (sessionId: string) => {
    const bridge = magiesTerminalBridge.get();
    await bridge?.jumpToSessionFromTrayPanel?.(sessionId);
  }, []);

  const connectToHostFromTrayPanel = useCallback(async (hostId: string) => {
    const bridge = magiesTerminalBridge.get();
    await bridge?.connectToHostFromTrayPanel?.(hostId);
  }, []);

  const onTrayPanelCloseRequest = useCallback((callback: () => void) => {
    const bridge = magiesTerminalBridge.get();
    return bridge?.onTrayPanelCloseRequest?.(callback);
  }, []);

  const onTrayPanelRefresh = useCallback((callback: () => void) => {
    const bridge = magiesTerminalBridge.get();
    return bridge?.onTrayPanelRefresh?.(callback);
  }, []);

  const onTrayPanelMenuData = useCallback(
    (
      callback: (data: {
        sessions?: Array<{ id: string; label: string; hostLabel: string; status: "connecting" | "connected" | "disconnected"; workspaceId?: string; workspaceTitle?: string }>;
        portForwardRules?: Array<{
          id: string;
          label: string;
          type: "local" | "remote" | "dynamic";
          localPort: number;
          remoteHost?: string;
          remotePort?: number;
          status: "inactive" | "connecting" | "active" | "error";
          hostId?: string;
        }>;
      }) => void,
    ) => {
      const bridge = magiesTerminalBridge.get();
      return bridge?.onTrayPanelMenuData?.(callback);
    },
    [],
  );

  return {
    hideTrayPanel,
    openMainWindow,
    quitApp,
    jumpToSession,
    connectToHostFromTrayPanel,
    onTrayPanelCloseRequest,
    onTrayPanelRefresh,
    onTrayPanelMenuData,
  };
};
