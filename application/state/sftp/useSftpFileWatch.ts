import { useEffect, useRef } from "react";
import { magiesTerminalBridge } from "../../../infrastructure/services/magiesTerminalBridge";
import type { FileWatchErrorEvent, FileWatchSyncedEvent, SftpStateOptions } from "./types";

export const useSftpFileWatch = (options?: SftpStateOptions) => {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.onFileWatchSynced || !bridge?.onFileWatchError) return;

    const unsubscribeSynced = bridge.onFileWatchSynced((payload: FileWatchSyncedEvent) => {
      optionsRef.current?.onFileWatchSynced?.(payload);
    });

    const unsubscribeError = bridge.onFileWatchError((payload: FileWatchErrorEvent) => {
      optionsRef.current?.onFileWatchError?.(payload);
    });

    return () => {
      try {
        unsubscribeSynced?.();
        unsubscribeError?.();
      } catch {
        // ignore cleanup errors
      }
    };
  }, []);
};
