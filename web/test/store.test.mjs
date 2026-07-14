import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.mjs";

test("host secrets stay encrypted and are never returned by listHosts", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mgterminal-store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir, "z".repeat(40));
  store.initializeAdmin("an-admin-password-longer-than-12");
  const created = store.createHost({ name: "Test", hostname: "127.0.0.1", port: 22, username: "root", password: "ssh-secret" });
  assert.equal(created.hasPassword, true);
  assert.equal(created.password, undefined);
  const onDisk = fs.readFileSync(path.join(dir, "hosts.json"), "utf8");
  assert.equal(onDisk.includes("ssh-secret"), false);
  assert.equal(store.getHost(created.id).secret.password, "ssh-secret");
});

test("changing an endpoint clears its trusted host key", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mgterminal-store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir, "k".repeat(40));
  const host = store.createHost({ name: "A", hostname: "server-a", username: "root", password: "secret" });
  store.setHostKey(host.id, "SHA256:known");
  const updated = store.updateHost(host.id, { hostname: "server-b" });
  assert.equal(updated.hostKey, null);
});
