import { useCallback } from 'react';
import { magiesTerminalBridge } from '../../infrastructure/services/magiesTerminalBridge';
import type { TerminalPopupPayload } from '../../domain/systemManager/types';

export function useTerminalPopupWindow() {
  const close = useCallback(async () => {
    await magiesTerminalBridge.get()?.windowClose?.();
  }, []);

  const setWindowTitle = useCallback(async (title: string) => {
    await magiesTerminalBridge.get()?.setWindowTitle?.(title);
  }, []);

  const onPopupConfig = useCallback((cb: (payload: TerminalPopupPayload) => void) => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.onTerminalPopupConfig) return () => {};
    return bridge.onTerminalPopupConfig(cb);
  }, []);

  return { close, setWindowTitle, onPopupConfig };
}
