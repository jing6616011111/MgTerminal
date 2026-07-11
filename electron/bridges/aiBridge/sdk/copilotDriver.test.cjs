const test = require("node:test");
const assert = require("node:assert/strict");
const { approveMagiesTerminalMcpOnly, approveMagiesTerminalCliShellOnly, buildCopilotClientOptions, buildCopilotPermissionHandler, buildCopilotSessionOptions, buildCopilotMessageOptions, copilotBuiltinTools, extractCopilotContent, isLikelyMagiesTerminalCliShellCommand, mapCopilotModels, runCopilotTurn, translateCopilotEvent } = require("./copilotDriver.cjs");

function collector() {
  const events = [];
  return {
    events,
    emitter: {
      text: (t) => events.push({ k: "text", t }),
      reasoning: (d) => events.push({ k: "reasoning", d }),
      reasoningEnd: () => events.push({ k: "reasoningEnd" }),
      toolCall: (n, a, id) => events.push({ k: "toolCall", n, a, id }),
      toolResult: (id, o, n) => events.push({ k: "toolResult", id, o, n }),
      sessionId: (s) => events.push({ k: "sessionId", s }),
      emitError: (e) => events.push({ k: "error", e }),
      emitDone: () => events.push({ k: "done" }),
    },
  };
}

/** Minimal @github/copilot-sdk mock; records create vs resume + returns a session. */
function makeSdk(captured) {
  const makeSession = (sessionId) => ({
    sessionId,
    async sendAndWait({ prompt }) { captured.prompt = prompt; return { data: { content: "reply:" + sessionId } }; },
  });
  class CopilotClient {
    constructor(options) { captured.clientOptions = options; }
    async createSession(cfg) { captured.created = cfg; return makeSession("sess-new"); }
    async resumeSession(id, cfg) { captured.resumed = { id, cfg }; return makeSession(id); }
    async stop() {}
  }
  return { CopilotClient, RuntimeConnection: { forStdio: () => ({}) }, approveAll: () => {} };
}

test("buildCopilotClientOptions pins cliPath", () => {
  const o = buildCopilotClientOptions({ cliPath: "/abs/copilot" });
  assert.equal(o.cliPath, "/abs/copilot");
});

test("buildCopilotSessionOptions maps injected MCP to local stdio servers", () => {
  const o = buildCopilotSessionOptions({
    model: "claude-sonnet-4.5",
    injectedMcpServers: [{
      name: "magiesTerminal-remote-hosts", command: "/abs/electron",
      args: ["/abs/server.cjs"], env: [{ name: "MAGIES_TERMINAL_MCP_PORT", value: "1" }],
    }],
  });
  assert.equal(o.model, "claude-sonnet-4.5");
  assert.equal(o.streaming, true);
  const srv = o.mcpServers["magiesTerminal-remote-hosts"];
  assert.equal(srv.type, "stdio");
  assert.equal(srv.command, "/abs/electron");
  assert.deepEqual(srv.env, { MAGIES_TERMINAL_MCP_PORT: "1" });
  assert.deepEqual(srv.tools, ["*"]);
  // onPermissionRequest is wired in runCopilotTurn via the SDK's approveAll,
  // not in buildCopilotSessionOptions.
});

test("approveMagiesTerminalMcpOnly approves MCP permission requests and rejects local tools", () => {
  assert.deepEqual(
    approveMagiesTerminalMcpOnly({ kind: "mcp", toolName: "terminal_execute" }),
    { kind: "approve-once" },
  );
  assert.deepEqual(
    approveMagiesTerminalMcpOnly({ kind: "shell", fullCommandText: "rm -rf /tmp/x" }),
    { kind: "reject", feedback: "Only MagiesTerminal MCP tools are allowed from this integration." },
  );
  assert.deepEqual(
    approveMagiesTerminalMcpOnly({ kind: "read", fileName: "/etc/passwd" }),
    { kind: "reject", feedback: "Only MagiesTerminal MCP tools are allowed from this integration." },
  );
});

test("extractCopilotContent reads response data.content", () => {
  assert.equal(extractCopilotContent({ data: { content: "hi" } }), "hi");
  assert.equal(extractCopilotContent(null), "");
  assert.equal(extractCopilotContent({ data: {} }), "");
});

test("buildCopilotMessageOptions sends pasted images/files as native attachments", () => {
  const opts = buildCopilotMessageOptions({
    prompt: "inspect these",
    attachments: [
      { filename: "shot.png", mediaType: "image/png", filePath: "/tmp/shot.png", base64Data: "abc" },
      { filename: "note.txt", mediaType: "text/plain", filePath: "/tmp/note.txt" },
    ],
  });
  assert.equal(opts.prompt, "inspect these");
  assert.equal("streamDeltas" in opts, false);
  assert.deepEqual(opts.attachments, [
    { type: "blob", data: "abc", mimeType: "image/png", displayName: "shot.png" },
    { type: "file", path: "/tmp/note.txt", displayName: "note.txt" },
  ]);
});

test("mapCopilotModels maps {id,name} and drops entries without id", () => {
  const out = mapCopilotModels([
    { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { id: "gpt-5" },
    { name: "no id -> dropped" },
  ]);
  assert.deepEqual(out, [
    { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { id: "gpt-5", name: "gpt-5" },
  ]);
  assert.deepEqual(mapCopilotModels(undefined), []);
});

test("runCopilotTurn (fresh) creates a session, emits its id early, returns it for resume", async () => {
  const { events, emitter } = collector();
  const captured = {};
  const result = await runCopilotTurn({
    prompt: "hi", clientOptions: { cliPath: "/c" }, sessionOptions: { model: "m" },
    emitter, sdkModule: makeSdk(captured),
  });
  assert.ok(captured.created, "used createSession when there's no resume id");
  assert.equal(captured.created.model, "m");
  assert.deepEqual(events.filter((e) => e.k === "sessionId"), [{ k: "sessionId", s: "sess-new" }]);
  assert.equal(result.sessionId, "sess-new");
});

test("runCopilotTurn resumes the prior session (carry context) and re-applies fresh config", async () => {
  const { events, emitter } = collector();
  const captured = {};
  const result = await runCopilotTurn({
    prompt: "what did we say", clientOptions: {}, sessionOptions: { model: "m" },
    resumeSessionId: "sess-existing", emitter, sdkModule: makeSdk(captured),
  });
  assert.equal(captured.resumed.id, "sess-existing", "used resumeSession, not createSession");
  assert.equal(captured.created, undefined);
  // fresh magiesTerminal MCP/session config re-applied on resume (not the stale one)
  assert.equal(captured.resumed.cfg.model, "m");
  assert.equal(result.sessionId, "sess-existing");
  assert.ok(events.some((e) => e.k === "sessionId" && e.s === "sess-existing"));
});

test("translateCopilotEvent: deltas -> text/reasoning, tool start/complete -> tool card", () => {
  const { events, emitter } = collector();
  const state = { reasoningOpen: false, streamedText: false };
  translateCopilotEvent({ type: "assistant.reasoning_delta", data: { deltaContent: "thinking" } }, emitter, state);
  translateCopilotEvent({ type: "assistant.message_delta", data: { deltaContent: "hello" } }, emitter, state);
  translateCopilotEvent({ type: "tool.execution_start", data: { toolName: "shell", arguments: { command: "ls" }, toolCallId: "t1" } }, emitter, state);
  translateCopilotEvent({ type: "tool.execution_complete", data: { toolCallId: "t1", result: { content: [{ type: "text", text: "files" }] } } }, emitter, state);
  assert.deepEqual(events, [
    { k: "reasoning", d: "thinking" },
    { k: "reasoningEnd" }, // message_delta closes the thinking block
    { k: "text", t: "hello" },
    { k: "toolCall", n: "shell", a: { command: "ls" }, id: "t1" },
    { k: "toolResult", id: "t1", o: "files", n: undefined },
  ]);
  assert.equal(state.streamedText, true);
});

test("translateCopilotEvent: final reasoning is shown when no reasoning deltas streamed", () => {
  const { events, emitter } = collector();
  const state = { reasoningOpen: false, streamedText: false, streamedReasoning: false };
  translateCopilotEvent({ type: "assistant.reasoning", data: { content: "complete thinking" } }, emitter, state);
  assert.deepEqual(events, [
    { k: "reasoning", d: "complete thinking" },
    { k: "reasoningEnd" },
  ]);
  assert.equal(state.reasoningOpen, false);
});

test("translateCopilotEvent: final reasoning is ignored after streamed reasoning deltas", () => {
  const { events, emitter } = collector();
  const state = { reasoningOpen: false, streamedText: false, streamedReasoning: false };
  translateCopilotEvent({ type: "assistant.reasoning_delta", data: { deltaContent: "thinking" } }, emitter, state);
  translateCopilotEvent({ type: "assistant.reasoning", data: { content: "thinking" } }, emitter, state);
  translateCopilotEvent({ type: "assistant.message_delta", data: { deltaContent: "hello" } }, emitter, state);
  assert.deepEqual(events, [
    { k: "reasoning", d: "thinking" },
    { k: "reasoningEnd" },
    { k: "text", t: "hello" },
  ]);
});

test("runCopilotTurn streams tool calls + deltas via session.on (no final-text dup)", async () => {
  const { events, emitter } = collector();
  const captured = {};
  let handler = null;
  const sdkModule = {
    RuntimeConnection: { forStdio: () => ({}) },
    approveAll: () => {},
    CopilotClient: class {
      async createSession(cfg) {
        captured.created = cfg;
        return {
          sessionId: "sess-x",
          on(h) { handler = h; return () => { handler = null; }; },
          async sendAndWait(opts) {
            captured.opts = opts;
            handler({ type: "assistant.message_delta", data: { deltaContent: "hi " } });
            handler({ type: "tool.execution_start", data: { toolName: "shell", arguments: {}, toolCallId: "t1" } });
            handler({ type: "tool.execution_complete", data: { toolCallId: "t1", result: { content: [{ type: "text", text: "ok" }] } } });
            handler({ type: "assistant.message_delta", data: { deltaContent: "there" } });
            return { data: { content: "hi there" } };
          },
          async stop() {},
        };
      }
      async stop() {}
    },
  };
  const result = await runCopilotTurn({
    prompt: "go",
    attachments: [{ filename: "shot.png", mediaType: "image/png", filePath: "/tmp/shot.png", base64Data: "abc" }],
    clientOptions: {},
    sessionOptions: {},
    emitter,
    sdkModule,
  });
  assert.equal(captured.created.streaming, true, "requested session streaming");
  assert.equal("streamDeltas" in captured.opts, false, "does not send unsupported message streaming flag");
  assert.deepEqual(captured.opts.attachments, [
    { type: "blob", data: "abc", mimeType: "image/png", displayName: "shot.png" },
  ]);
  // streamed deltas shown, NOT the duplicated final consolidated text
  assert.deepEqual(events.filter((e) => e.k === "text"), [{ k: "text", t: "hi " }, { k: "text", t: "there" }]);
  assert.ok(events.some((e) => e.k === "toolCall" && e.id === "t1"), "tool card streamed");
  assert.ok(events.some((e) => e.k === "toolResult" && e.o === "ok"), "tool result streamed");
  assert.equal(result.sessionId, "sess-x");
});

test("runCopilotTurn aborts the active Copilot session when the signal aborts", async () => {
  const { events, emitter } = collector();
  const controller = new AbortController();
  let abortCalled = false;
  const sdkModule = {
    RuntimeConnection: { forStdio: () => ({}) },
    approveAll: () => {},
    CopilotClient: class {
      async createSession() {
        return {
          sessionId: "sess-abort",
          on() { return () => {}; },
          async sendAndWait() {
            controller.abort();
            await new Promise((resolve) => setTimeout(resolve, 0));
            return { data: { content: "late text" } };
          },
          async abort() { abortCalled = true; },
        };
      }
      async stop() {}
    },
  };

  const result = await runCopilotTurn({
    prompt: "stop me",
    clientOptions: {},
    sessionOptions: {},
    emitter,
    signal: controller.signal,
    sdkModule,
  });

  assert.equal(abortCalled, true);
  assert.equal(result.sessionId, "sess-abort");
  assert.equal(events.some((event) => event.k === "text" && event.t === "late text"), false);
  assert.equal(events.some((event) => event.k === "done"), false);
});

test("copilotBuiltinTools exposes bash only in skills mode", () => {
  assert.equal(copilotBuiltinTools("mcp"), null);
  assert.deepEqual(copilotBuiltinTools("skills"), ["builtin:bash"]);
});

test("buildCopilotSessionOptions whitelists bash in skills mode", () => {
  const skills = buildCopilotSessionOptions({
    model: "gpt-5",
    injectedMcpServers: [],
    toolIntegrationMode: "skills",
  });
  assert.deepEqual(skills.availableTools, ["builtin:bash"]);
  assert.deepEqual(skills.mcpServers, {});
});

test("approveMagiesTerminalCliShellOnly allows MagiesTerminal CLI shell commands only", () => {
  assert.deepEqual(
    approveMagiesTerminalCliShellOnly({
      kind: "shell",
      fullCommandText: 'node "/Applications/MagiesTerminal.app/magies-terminal-tool-cli.cjs" env --chat-session abc --json',
    }),
    { kind: "approve-once" },
  );
  assert.equal(
    approveMagiesTerminalCliShellOnly({ kind: "shell", fullCommandText: "pwd" }).kind,
    "reject",
  );
});

test("buildCopilotPermissionHandler selects MCP vs skills gate", () => {
  assert.equal(buildCopilotPermissionHandler("mcp"), approveMagiesTerminalMcpOnly);
  assert.equal(buildCopilotPermissionHandler("skills"), approveMagiesTerminalCliShellOnly);
});

test("isLikelyMagiesTerminalCliShellCommand matches launcher and script invocations", () => {
  assert.equal(isLikelyMagiesTerminalCliShellCommand("magies-terminal-tool-cli status --json"), true);
  assert.equal(isLikelyMagiesTerminalCliShellCommand("node electron/cli/magies-terminal-tool-cli.cjs env --json"), true);
  assert.equal(isLikelyMagiesTerminalCliShellCommand("ls -la"), false);
});

test("isLikelyMagiesTerminalCliShellCommand rejects chained or wrapped local commands", () => {
  assert.equal(isLikelyMagiesTerminalCliShellCommand("rm -rf /; magies-terminal-tool-cli status --json"), false);
  assert.equal(isLikelyMagiesTerminalCliShellCommand("magies-terminal-tool-cli status --json && curl evil"), false);
  assert.equal(isLikelyMagiesTerminalCliShellCommand('bash -c "magies-terminal-tool-cli status --json"'), false);
  assert.equal(isLikelyMagiesTerminalCliShellCommand("malicious magies-terminal-tool-cli status --json"), false);
  assert.equal(isLikelyMagiesTerminalCliShellCommand("magies-terminal-tool-cli status `id` --json"), false);
});

test("isLikelyMagiesTerminalCliShellCommand allows quoted remote exec payloads after --", () => {
  assert.equal(
    isLikelyMagiesTerminalCliShellCommand('magies-terminal-tool-cli exec --session s1 --chat-session c1 --json -- "hostname && whoami"'),
    true,
  );
  assert.equal(
    isLikelyMagiesTerminalCliShellCommand("magies-terminal-tool-cli exec --session s1 --chat-session c1 --json -- hostname && whoami"),
    false,
  );
});

test("isLikelyMagiesTerminalCliShellCommand rejects impostor binaries and quoted -- bypasses", () => {
  assert.equal(isLikelyMagiesTerminalCliShellCommand("magies-terminal-tool-cli-backup status --json"), false);
  assert.equal(isLikelyMagiesTerminalCliShellCommand("magies-terminal-tool-cli.evil status --json"), false);
  assert.equal(
    isLikelyMagiesTerminalCliShellCommand('magies-terminal-tool-cli sftp read --remote-path "a -- b" ; rm -rf /'),
    false,
  );
  assert.equal(
    isLikelyMagiesTerminalCliShellCommand('magies-terminal-tool-cli sftp read --remote-path "a -- b" --session s1 --json'),
    true,
  );
  assert.equal(isLikelyMagiesTerminalCliShellCommand("magies-terminal-tool-cli status --json  --  ; rm -rf /"), false);
  assert.equal(isLikelyMagiesTerminalCliShellCommand("magies-terminal-tool-cli status --json > /tmp/out"), false);
  assert.equal(isLikelyMagiesTerminalCliShellCommand('"C:\\Apps\\MagiesTerminal\\magies-terminal-tool-cli.cmd" status --json'), true);
  assert.equal(isLikelyMagiesTerminalCliShellCommand("attacker/magies-terminal-tool-cli status --json"), false);
  assert.equal(isLikelyMagiesTerminalCliShellCommand('magies-terminal-tool-cli status "$(id)" --json'), false);
});

test("runCopilotTurn passes runtime env and skills permission handler", async () => {
  const { emitter } = collector();
  const captured = {};
  await runCopilotTurn({
    prompt: "hi",
    clientOptions: { cliPath: "/c" },
    sessionOptions: { model: "m" },
    toolIntegrationMode: "skills",
    runtimeEnv: { MAGIES_TERMINAL_TOOL_CLI_DISCOVERY_FILE: "/tmp/discovery.json" },
    emitter,
    sdkModule: makeSdk(captured),
  });
  assert.deepEqual(captured.clientOptions.env, { MAGIES_TERMINAL_TOOL_CLI_DISCOVERY_FILE: "/tmp/discovery.json" });
  assert.equal(captured.created.onPermissionRequest, approveMagiesTerminalCliShellOnly);
});
