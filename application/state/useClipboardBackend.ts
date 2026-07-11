import { useCallback } from "react";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

export const useClipboardBackend = () => {
  const readClipboardText = useCallback(async (): Promise<string> => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.readClipboardText) throw new Error("clipboard bridge unavailable");

    const text = await bridge.readClipboardText();
    return typeof text === "string" ? text : "";
  }, []);

  return { readClipboardText };
};
