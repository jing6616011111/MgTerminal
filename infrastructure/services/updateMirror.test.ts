import assert from "node:assert/strict";
import test from "node:test";

import { manifestToReleaseInfo, shouldPreferMirror } from "./updateMirror.ts";

test("mainland-China locale or timezone prefers the mirror", () => {
  assert.equal(shouldPreferMirror({ locale: "zh-CN", timeZone: "Asia/Shanghai" }), true);
  assert.equal(shouldPreferMirror({ locale: "zh-CN", timeZone: "America/New_York" }), true);
  assert.equal(shouldPreferMirror({ locale: "en-US", timeZone: "Asia/Shanghai" }), true);
  assert.equal(shouldPreferMirror({ locale: "en-US", timeZone: "Asia/Urumqi" }), true);
});

test("other regions prefer GitHub", () => {
  assert.equal(shouldPreferMirror({ locale: "en-US", timeZone: "America/New_York" }), false);
  assert.equal(shouldPreferMirror({ locale: "zh-TW", timeZone: "Asia/Taipei" }), false);
  assert.equal(shouldPreferMirror({ locale: "ja-JP", timeZone: "Asia/Tokyo" }), false);
  assert.equal(shouldPreferMirror({ locale: "", timeZone: "" }), false);
  assert.equal(shouldPreferMirror({}), false);
});

test("manifest maps to the ReleaseInfo shape used by the update banner", () => {
  const info = manifestToReleaseInfo({
    version: "0.4.0",
    tag: "v0.4.0",
    publishedAt: "2026-07-13T12:00:00.000Z",
    files: [
      { name: "MagiesTerminal-0.4.0-mac-arm64.dmg", size: 10, url: "https://dl.magies.top/stable/MagiesTerminal-0.4.0-mac-arm64.dmg" },
      { name: "latest.yml", size: 1, url: "https://dl.magies.top/stable/latest.yml" },
    ],
  });

  assert.equal(info.version, "0.4.0");
  assert.equal(info.tagName, "v0.4.0");
  assert.equal(info.publishedAt, "2026-07-13T12:00:00.000Z");
  assert.equal(info.assets.length, 2);
  assert.deepEqual(info.assets[0], {
    name: "MagiesTerminal-0.4.0-mac-arm64.dmg",
    browserDownloadUrl: "https://dl.magies.top/stable/MagiesTerminal-0.4.0-mac-arm64.dmg",
    size: 10,
  });
});
