import assert from "node:assert/strict";
import test from "node:test";

import { buildManifest, resolveAssetName } from "./src/worker.js";

test("manifest is synthesized from the GitHub API release payload", () => {
  const manifest = buildManifest(
    {
      tag_name: "v0.4.0",
      published_at: "2026-07-13T12:00:00Z",
      assets: [
        { name: "MagiesTerminal-0.4.0-mac-arm64.dmg", size: 111 },
        { name: "latest.yml", size: 22 },
      ],
    },
    "https://dl.magies.top",
  );

  assert.equal(manifest.version, "0.4.0");
  assert.equal(manifest.tag, "v0.4.0");
  assert.equal(manifest.publishedAt, "2026-07-13T12:00:00Z");
  assert.deepEqual(manifest.files[0], {
    name: "MagiesTerminal-0.4.0-mac-arm64.dmg",
    size: 111,
    url: "https://dl.magies.top/stable/MagiesTerminal-0.4.0-mac-arm64.dmg",
  });
  assert.equal(manifest.files[1].url, "https://dl.magies.top/stable/latest.yml");
});

test("asset names resolve only under /stable/ and never the manifest itself", () => {
  assert.equal(resolveAssetName("/stable/latest.yml"), "latest.yml");
  assert.equal(
    resolveAssetName("/stable/MagiesTerminal-0.4.0-win-x64.exe"),
    "MagiesTerminal-0.4.0-win-x64.exe",
  );
  assert.equal(resolveAssetName("/stable/release.json"), null);
  assert.equal(resolveAssetName("/stable/"), null);
  assert.equal(resolveAssetName("/stable/a/b"), null);
  assert.equal(resolveAssetName("/other/latest.yml"), null);
});

test("encoded asset names are decoded", () => {
  assert.equal(resolveAssetName("/stable/some%20file.zip"), "some file.zip");
});
