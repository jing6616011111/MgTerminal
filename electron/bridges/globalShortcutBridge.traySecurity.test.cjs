const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const BRIDGE_PATH = require.resolve("./globalShortcutBridge.cjs");

function loadBridgeWithApp({ isPackaged, envUrl }) {
  const previousUrl = process.env.VITE_DEV_SERVER_URL;
  if (envUrl === undefined) {
    delete process.env.VITE_DEV_SERVER_URL;
  } else {
    process.env.VITE_DEV_SERVER_URL = envUrl;
  }

  delete require.cache[BRIDGE_PATH];
  const bridge = require("./globalShortcutBridge.cjs");
  bridge.init({
    electronModule: {
      app: { isPackaged },
      BrowserWindow: class {},
      screen: {},
    },
  });

  const restore = () => {
    if (previousUrl === undefined) delete process.env.VITE_DEV_SERVER_URL;
    else process.env.VITE_DEV_SERVER_URL = previousUrl;
    delete require.cache[BRIDGE_PATH];
  };

  return { bridge, restore };
}

test("packaged tray panel ignores VITE_DEV_SERVER_URL", () => {
  const { bridge, restore } = loadBridgeWithApp({
    isPackaged: true,
    envUrl: "https://evil.example",
  });
  try {
    assert.equal(bridge.getTrayPanelDevServerUrl(), undefined);
    assert.equal(bridge.getTrayPanelUrl(), "app://magiesTerminal/index.html#/tray");
    assert.equal(bridge.isAllowedTrayPanelUrl("https://evil.example/#/tray"), false);
    assert.equal(bridge.isAllowedTrayPanelUrl("app://magiesTerminal/index.html#/tray"), true);
  } finally {
    restore();
  }
});

test("unpackaged tray panel may use local Vite dev server", () => {
  const { bridge, restore } = loadBridgeWithApp({
    isPackaged: false,
    envUrl: "http://localhost:5173",
  });
  try {
    assert.equal(bridge.getTrayPanelDevServerUrl(), "http://localhost:5173");
    assert.equal(bridge.getTrayPanelUrl(), "http://localhost:5173/#/tray");
    assert.equal(bridge.isAllowedTrayPanelUrl("http://localhost:5173/#/tray"), true);
    assert.equal(bridge.isAllowedTrayPanelUrl("https://evil.example/"), false);
  } finally {
    restore();
  }
});

test("tray panel attaches navigate/redirect/window-open guards", () => {
  const { bridge, restore } = loadBridgeWithApp({
    isPackaged: true,
    envUrl: "https://evil.example",
  });
  try {
    const handlers = new Map();
    let openHandler = null;
    const win = {
      webContents: {
        on(eventName, handler) {
          handlers.set(eventName, handler);
        },
        setWindowOpenHandler(handler) {
          openHandler = handler;
        },
      },
    };

    bridge.attachTrayPanelNavigationGuards(win);

    assert.equal(typeof handlers.get("will-navigate"), "function");
    assert.equal(typeof handlers.get("will-redirect"), "function");
    assert.equal(typeof openHandler, "function");

    let prevented = false;
    handlers.get("will-navigate")(
      {
        preventDefault() {
          prevented = true;
        },
      },
      "https://evil.example/pwn",
    );
    assert.equal(prevented, true);
    assert.deepEqual(openHandler({ url: "https://evil.example" }), { action: "deny" });
  } finally {
    restore();
  }
});

test("preload source refuses packaged VITE_DEV_SERVER_URL trust", () => {
  const preload = require("node:fs").readFileSync(
    path.join(__dirname, "../preload.cjs"),
    "utf8",
  );
  assert.match(preload, /isPackagedPreloadHost/);
  assert.match(preload, /app\.asar/);
  assert.match(preload, /if \(isPackagedPreloadHost\(\)\)/);
});
