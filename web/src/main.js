import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "./style.css";

const app = document.querySelector("#app");
const state = { hosts: [], selectedHost: null, ws: null, terminal: null, fit: null, resizeObserver: null, resizeFrame: null, pendingFingerprint: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

function toast(message, kind = "info") {
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 3600);
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-page">
      <section class="login-card">
        <div class="brand-mark">M</div>
        <p class="eyebrow">SECURE WEB CONSOLE</p>
        <h1>MgTerminal Web</h1>
        <p class="muted">通过浏览器安全连接与管理你的 SSH 服务器</p>
        <form id="login-form">
          <label>管理员密码<input name="password" type="password" autocomplete="current-password" minlength="12" required autofocus /></label>
          <button type="submit">进入控制台</button>
        </form>
        <p class="login-note">建议仅通过 HTTPS 或内网 VPN 访问</p>
      </section>
    </main>`;
  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password: new FormData(event.currentTarget).get("password") }) });
      await renderConsole();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
}

function hostCards() {
  if (!state.hosts.length) return `<div class="empty-list">还没有服务器<br><span>点击“添加主机”开始</span></div>`;
  return state.hosts.map((host) => `
    <button class="host-card ${state.selectedHost?.id === host.id ? "active" : ""}" data-host-id="${host.id}">
      <span class="host-dot" style="--host-color:${host.color}"></span>
      <span class="host-copy"><strong>${escapeHtml(host.name)}</strong><small>${escapeHtml(host.username)}@${escapeHtml(host.hostname)}:${host.port}</small></span>
      <span class="host-chevron">›</span>
    </button>`).join("");
}

async function loadHosts() {
  const data = await api("/api/hosts");
  state.hosts = data.hosts;
  if (state.selectedHost) state.selectedHost = state.hosts.find((host) => host.id === state.selectedHost.id) || null;
}

function renderShell() {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark small">M</div><div><strong>MgTerminal</strong><small>WEB CONSOLE</small></div></div>
        <button id="add-host" class="add-button"><span>＋</span> 添加主机</button>
        <div class="section-label">服务器 <span>${state.hosts.length}</span></div>
        <div id="host-list" class="host-list">${hostCards()}</div>
        <div class="sidebar-footer"><span class="secure-dot"></span> 加密凭据存储<button id="logout">退出</button></div>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div><p class="eyebrow">BROWSER SSH MANAGEMENT</p><h1>${state.selectedHost ? escapeHtml(state.selectedHost.name) : "服务器控制台"}</h1></div>
          <div class="status-pill" id="connection-status"><span></span> 未连接</div>
        </header>
        <section class="content">
          <div id="welcome" class="welcome ${state.selectedHost ? "hidden" : ""}">
            <div class="hero-icon">⌁</div><h2>从浏览器管理你的服务器</h2>
            <p>选择左侧服务器打开实时 SSH 终端。连接由 MgTerminal Web 服务端代理，凭据不会发送回浏览器。</p>
            <button id="welcome-add">添加第一台服务器</button>
            <div class="feature-grid"><div><b>🔒</b><strong>服务端加密</strong><span>AES-256-GCM 保存凭据</span></div><div><b>⌨</b><strong>实时终端</strong><span>WebSocket + xterm.js</span></div><div><b>✓</b><strong>主机校验</strong><span>首次连接确认 SSH 指纹</span></div></div>
          </div>
          <div id="terminal-panel" class="terminal-panel ${state.selectedHost ? "" : "hidden"}">
            <div class="terminal-toolbar"><div class="traffic"><i></i><i></i><i></i></div><span id="terminal-title">等待连接</span><div class="toolbar-actions"><button id="edit-host">编辑</button><button id="connect-host" class="primary">连接</button></div></div>
            <div id="terminal"></div>
          </div>
        </section>
      </main>
    </div>
    <dialog id="host-dialog"><form id="host-form"><div class="dialog-head"><div><p class="eyebrow">SSH PROFILE</p><h2 id="dialog-title">添加服务器</h2></div><button type="button" class="icon-button" id="close-dialog">×</button></div>
      <input type="hidden" name="id" />
      <div class="form-grid">
        <label class="span-2">显示名称<input name="name" maxlength="80" placeholder="生产服务器" required /></label>
        <label>主机地址<input name="hostname" maxlength="255" placeholder="192.168.1.10" required /></label>
        <label>SSH 端口<input name="port" type="number" min="1" max="65535" value="22" required /></label>
        <label class="span-2">用户名<input name="username" maxlength="128" placeholder="root" required /></label>
        <label class="span-2">密码 <span class="optional">编辑时留空表示不修改</span><input name="password" type="password" autocomplete="new-password" /></label>
        <label class="span-2">SSH 私钥 <span class="optional">支持 OpenSSH/PEM</span><textarea name="privateKey" rows="5" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"></textarea></label>
        <label class="span-2">私钥口令<input name="passphrase" type="password" autocomplete="new-password" /></label>
        <label class="color-label">标识颜色<input name="color" type="color" value="#52d3a5" /></label>
      </div>
      <div class="dialog-actions"><button type="button" class="danger hidden" id="delete-host">删除</button><span></span><button type="button" class="secondary" id="cancel-dialog">取消</button><button type="submit">保存服务器</button></div>
    </form></dialog>
    <dialog id="fingerprint-dialog" class="fingerprint-dialog"><form method="dialog"><div class="fingerprint-icon">!</div><h2>确认 SSH 主机指纹</h2><p id="fingerprint-message"></p><code id="fingerprint-value"></code><p class="warning-text">请与服务器管理员核对指纹。错误确认可能遭遇中间人攻击。</p><div class="dialog-actions center"><button value="cancel" class="secondary">取消</button><button value="confirm">确认并连接</button></div></form></dialog>`;
  bindShellEvents();
  setupTerminal();
}

async function renderConsole() {
  try {
    await loadHosts();
    renderShell();
  } catch (error) {
    if (/登录/.test(error.message)) return renderLogin();
    throw error;
  }
}

function setupTerminal() {
  const container = document.querySelector("#terminal");
  state.resizeObserver?.disconnect();
  if (state.resizeFrame) cancelAnimationFrame(state.resizeFrame);
  state.terminal?.dispose();
  state.terminal = new Terminal({ cursorBlink: true, convertEol: false, fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', fontSize: 14, lineHeight: 1.2, theme: { background: "#07101d", foreground: "#d9e7f3", cursor: "#57d6a7", selectionBackground: "#315b6c88", black: "#07101d", brightBlack: "#516479", green: "#57d6a7", cyan: "#50c5dc" }, scrollback: 10000 });
  state.fit = new FitAddon();
  state.terminal.loadAddon(state.fit);
  state.terminal.open(container);
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    state.terminal.loadAddon(webgl);
  } catch {
    // xterm automatically keeps its built-in renderer when WebGL is unavailable.
  }
  const scheduleFit = () => {
    if (state.resizeFrame) cancelAnimationFrame(state.resizeFrame);
    state.resizeFrame = requestAnimationFrame(() => {
      state.resizeFrame = null;
      state.fit?.fit();
    });
  };
  state.resizeObserver = new ResizeObserver(scheduleFit);
  state.resizeObserver.observe(container);
  scheduleFit();
  state.terminal.writeln("\x1b[38;2;87;214;167mMgTerminal Web\x1b[0m — 选择服务器并点击连接\r\n");
  state.terminal.onData((data) => sendWs({ type: "input", data }));
  state.terminal.onResize(({ cols, rows }) => sendWs({ type: "resize", cols, rows }));
}

function setConnectionStatus(text, connected = false) {
  const node = document.querySelector("#connection-status");
  if (!node) return;
  node.classList.toggle("connected", connected);
  node.innerHTML = `<span></span> ${escapeHtml(text)}`;
}

function sendWs(message) {
  if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(message));
}

function connectSelectedHost() {
  if (!state.selectedHost) return;
  state.ws?.close();
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal`);
  ws.binaryType = "arraybuffer";
  state.ws = ws;
  state.terminal.clear();
  state.terminal.writeln(`\x1b[90m正在连接 ${state.selectedHost.username}@${state.selectedHost.hostname}:${state.selectedHost.port} ...\x1b[0m\r\n`);
  setConnectionStatus("连接中");
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "connect", hostId: state.selectedHost.id })));
  ws.addEventListener("message", (event) => {
    if (state.ws !== ws) return;
    if (event.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(event.data);
      state.terminal.write(bytes, () => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ack", bytes: bytes.byteLength }));
      });
      return;
    }
    const message = JSON.parse(event.data);
    if (message.type === "ready") { setConnectionStatus("已连接", true); document.querySelector("#connect-host").textContent = "断开"; state.fit.fit(); sendWs({ type: "resize", cols: state.terminal.cols, rows: state.terminal.rows }); state.terminal.focus(); }
    if (message.type === "exit") { setConnectionStatus("已断开"); document.querySelector("#connect-host").textContent = "连接"; state.terminal.writeln("\r\n\x1b[90m连接已关闭\x1b[0m"); }
    if (message.type === "error") { setConnectionStatus("连接失败"); state.terminal.writeln(`\r\n\x1b[31m${message.message}\x1b[0m`); toast(message.message, "error"); }
    if (message.type === "host-key") showFingerprint(message);
  });
  ws.addEventListener("close", () => { if (state.ws === ws) { setConnectionStatus("未连接"); document.querySelector("#connect-host").textContent = "连接"; } });
}

function showFingerprint(message) {
  state.pendingFingerprint = message.fingerprint;
  document.querySelector("#fingerprint-message").textContent = message.changed ? "警告：该服务器的 SSH 指纹与已保存值不同。只有确认服务器确实更换过密钥时才能继续。" : "这是首次连接该服务器，请确认下面的 SSH 主机指纹：";
  document.querySelector("#fingerprint-value").textContent = message.fingerprint;
  const dialog = document.querySelector("#fingerprint-dialog");
  dialog.classList.toggle("changed", Boolean(message.changed));
  dialog.showModal();
}

function openHostDialog(host = null) {
  const dialog = document.querySelector("#host-dialog");
  const form = document.querySelector("#host-form");
  form.reset();
  form.elements.port.value = host?.port || 22;
  form.elements.color.value = host?.color || "#52d3a5";
  form.elements.id.value = host?.id || "";
  for (const key of ["name", "hostname", "username"]) form.elements[key].value = host?.[key] || "";
  document.querySelector("#dialog-title").textContent = host ? "编辑服务器" : "添加服务器";
  document.querySelector("#delete-host").classList.toggle("hidden", !host);
  dialog.showModal();
}

function bindShellEvents() {
  document.querySelector("#add-host").onclick = () => openHostDialog();
  document.querySelector("#welcome-add").onclick = () => openHostDialog();
  document.querySelector("#close-dialog").onclick = () => document.querySelector("#host-dialog").close();
  document.querySelector("#cancel-dialog").onclick = () => document.querySelector("#host-dialog").close();
  document.querySelector("#logout").onclick = async () => { await api("/api/logout", { method: "POST" }); state.ws?.close(); renderLogin(); };
  document.querySelector("#host-list").onclick = (event) => {
    const card = event.target.closest("[data-host-id]");
    if (!card) return;
    state.ws?.close();
    state.selectedHost = state.hosts.find((host) => host.id === card.dataset.hostId);
    renderShell();
  };
  document.querySelector("#edit-host").onclick = () => openHostDialog(state.selectedHost);
  document.querySelector("#connect-host").onclick = () => {
    if (state.ws?.readyState === WebSocket.OPEN) { sendWs({ type: "disconnect" }); state.ws.close(); return; }
    connectSelectedHost();
  };
  document.querySelector("#host-form").onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const id = data.id; delete data.id; data.port = Number(data.port);
    try {
      const result = await api(id ? `/api/hosts/${id}` : "/api/hosts", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
      state.selectedHost = result.host;
      document.querySelector("#host-dialog").close();
      await loadHosts(); renderShell(); toast("服务器已保存", "success");
    } catch (error) { toast(error.message, "error"); }
  };
  document.querySelector("#delete-host").onclick = async () => {
    const id = document.querySelector("#host-form").elements.id.value;
    if (!id || !confirm("确定删除这台服务器及其加密凭据吗？")) return;
    await api(`/api/hosts/${id}`, { method: "DELETE" });
    state.selectedHost = null; await loadHosts(); renderShell(); toast("服务器已删除");
  };
  document.querySelector("#fingerprint-dialog").addEventListener("close", (event) => {
    if (event.currentTarget.returnValue === "confirm" && state.pendingFingerprint) sendWs({ type: "trust-host-key", fingerprint: state.pendingFingerprint });
    else state.ws?.close();
    state.pendingFingerprint = null;
  });
}

const session = await api("/api/session").catch(() => ({ authenticated: false }));
if (session.authenticated) renderConsole(); else renderLogin();
