const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "../..");

test("selectFile/selectDirectory attach the dialog to the sender BrowserWindow", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "electron/main/registerBridges.cjs"),
    "utf8",
  );

  assert.match(
    source,
    /magiesTerminal:selectFile[\s\S]*BrowserWindow\.fromWebContents\(event\.sender\)/,
    "selectFile must parent the open dialog to the requesting window (macOS otherwise may not surface it)",
  );
  assert.match(
    source,
    /magiesTerminal:selectDirectory[\s\S]*BrowserWindow\.fromWebContents\(event\.sender\)/,
    "selectDirectory must parent the open dialog to the requesting window",
  );
  assert.match(
    source,
    /dialog\.showOpenDialog\(owner,/,
    "showOpenDialog must receive the owner BrowserWindow",
  );
});
