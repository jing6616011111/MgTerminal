export class BridgeUnavailableError extends Error {
  constructor(message = "MagiesTerminal bridge unavailable") {
    super(message);
    this.name = "BridgeUnavailableError";
  }
}

export const magiesTerminalBridge = {
  get(): MagiesTerminalBridge | undefined {
    return window.magiesTerminal;
  },

  require(): MagiesTerminalBridge {
    const bridge = window.magiesTerminal;
    if (!bridge) throw new BridgeUnavailableError();
    return bridge;
  },
};
