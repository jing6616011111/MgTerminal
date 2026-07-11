import { useCallback } from "react";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

export function subscribeWindowFullscreenChanged(
  cb: (isFullscreen: boolean) => void,
): () => void {
  try {
    return magiesTerminalBridge.get()?.onWindowFullScreenChanged?.(cb) ?? (() => {});
  } catch {
    return () => {};
  }
}

export const useWindowControls = () => {
  const notifyRendererReady = useCallback(() => {
    try {
      magiesTerminalBridge.get()?.rendererReady?.();
    } catch {
      // ignore
    }
  }, []);

  const closeSettingsWindow = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    await bridge?.closeSettingsWindow?.();
  }, []);

  const openSettingsWindow = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.openSettingsWindow) return false;
    try {
      return Boolean(await bridge.openSettingsWindow());
    } catch (error) {
      console.error("[MagiesTerminal] Failed to open settings window:", error);
      return false;
    }
  }, []);

  const minimize = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    await bridge?.windowMinimize?.();
  }, []);

  const maximize = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    return bridge?.windowMaximize?.();
  }, []);

  const close = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    await bridge?.windowClose?.();
  }, []);

  const isMaximized = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    return bridge?.windowIsMaximized?.();
  }, []);

  const isFullscreen = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    return bridge?.windowIsFullscreen?.() ?? false;
  }, []);

  const onFullscreenChanged = useCallback(subscribeWindowFullscreenChanged, []);

  const onWindowCommandCloseRequested = useCallback((cb: () => void) => {
    const bridge = magiesTerminalBridge.get();
    return bridge?.onWindowCommandCloseRequested?.(cb) ?? (() => {});
  }, []);

  return {
    notifyRendererReady,
    closeSettingsWindow,
    openSettingsWindow,
    minimize,
    maximize,
    close,
    isMaximized,
    isFullscreen,
    onFullscreenChanged,
    onWindowCommandCloseRequested,
  };
};
