import { useCallback } from "react";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

export const useKeychainBackend = () => {
  const generateKeyPair = useCallback(async (options: { type: "RSA" | "ECDSA" | "ED25519"; bits?: number; comment?: string }) => {
    const bridge = magiesTerminalBridge.get();
    return bridge?.generateKeyPair?.(options);
  }, []);

  const execCommand = useCallback(async (options: {
    hostname: string;
    username: string;
    port?: number;
    password?: string;
    privateKey?: string;
    command: string;
    timeout?: number;
    enableKeyboardInteractive?: boolean;
    sessionId?: string;
    // Algorithm settings — let the keychain "export public key" flow honor
    // the same per-host SSH algorithm config the terminal uses, so a host
    // that needs the ECDSA skip / legacy mode / advanced overrides works
    // here too.
    legacyAlgorithms?: boolean;
    skipEcdsaHostKey?: boolean;
    algorithmOverrides?: import("../../domain/models").HostAlgorithmOverrides;
  }) => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.execCommand) throw new Error("execCommand unavailable");
    return bridge.execCommand(options);
  }, []);

  return { generateKeyPair, execCommand };
};

