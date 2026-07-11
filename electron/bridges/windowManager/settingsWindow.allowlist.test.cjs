const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "../../..");

test("settings window allows packaged app:// navigation by host, not WHATWG origin", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "electron/bridges/windowManager/settingsWindow.cjs"),
    "utf8",
  );

  assert.match(
    source,
    /parsedUrl\.protocol === ["']app:["'] && parsedUrl\.host === ["']magiesTerminal["']/,
    "Settings window must allow app://magiesTerminal by protocol+host (origin is the string null in packaged builds)",
  );
  assert.equal(
    /return allowedOrigins\.has\(new URL\(String\(targetUrl\)\)\.origin\);/.test(source),
    false,
    "Settings window must not rely only on URL.origin for app:// allowlisting",
  );
});

test("AppLogo uses the packaged terminal icon instead of the legacy cat SVG", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "components/AppLogo.tsx"),
    "utf8",
  );

  assert.match(source, /src=["']\/icon\.png["']/);
  assert.equal(/618\.5,240\.5|paw|squinty/i.test(source), false);
});
