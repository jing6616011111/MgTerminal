"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveRpcTimeoutMs, isLongRunningRpcMethod, isApprovalWaitRpcMethod } = require("./rpcTimeouts.cjs");
const { CAPABILITY_SURFACES, PERMISSION_MODES, RPC_TIMEOUT_DEFAULTS } = require("./constants.cjs");

test("long-running rpc methods include exec and sftp home", () => {
  assert.equal(isLongRunningRpcMethod("magiesTerminal/exec"), true);
  assert.equal(isLongRunningRpcMethod("magiesTerminal/sftp/read"), true);
  assert.equal(isLongRunningRpcMethod("magiesTerminal/sftp/home"), true);
  assert.equal(isLongRunningRpcMethod("magiesTerminal/jobPoll"), false);
});

test("approval wait methods follow confirm mode and capability policy", () => {
  assert.equal(
    isApprovalWaitRpcMethod("magiesTerminal/exec", CAPABILITY_SURFACES.BUILTIN, PERMISSION_MODES.CONFIRM),
    true,
  );
  assert.equal(
    isApprovalWaitRpcMethod("magiesTerminal/jobStop", CAPABILITY_SURFACES.BUILTIN, PERMISSION_MODES.CONFIRM),
    false,
  );
  assert.equal(
    isApprovalWaitRpcMethod("magiesTerminal/sftp/list", CAPABILITY_SURFACES.BUILTIN, PERMISSION_MODES.CONFIRM),
    false,
  );
  assert.equal(
    isApprovalWaitRpcMethod("public/sftp/list", CAPABILITY_SURFACES.PUBLIC, PERMISSION_MODES.CONFIRM),
    true,
  );
});

test("resolveRpcTimeoutMs combines operation and approval budgets", () => {
  const timeoutMs = resolveRpcTimeoutMs("magiesTerminal/exec", {
    surface: CAPABILITY_SURFACES.BUILTIN,
    bridgeCommandTimeoutMs: 60_000,
    bridgePermissionMode: PERMISSION_MODES.CONFIRM,
    bridgeApprovalTimeoutMs: 110_000,
  });
  assert.equal(
    timeoutMs,
    Math.max(
      RPC_TIMEOUT_DEFAULTS.DEFAULT_RPC_TIMEOUT_MS,
      110_000 + 60_000 + RPC_TIMEOUT_DEFAULTS.RPC_TIMEOUT_BUFFER_MS,
    ),
  );
});

test("resolveRpcTimeoutMs falls back to default for lightweight rpc", () => {
  const timeoutMs = resolveRpcTimeoutMs("magiesTerminal/getStatus", {
    surface: CAPABILITY_SURFACES.BUILTIN,
    bridgePermissionMode: PERMISSION_MODES.CONFIRM,
  });
  assert.equal(timeoutMs, RPC_TIMEOUT_DEFAULTS.DEFAULT_RPC_TIMEOUT_MS);
});
