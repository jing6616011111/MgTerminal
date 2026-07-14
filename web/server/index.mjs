import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ssh2 from "ssh2";
import { WebSocketServer } from "ws";
import { Store } from "./store.mjs";
import {
  createSessionToken,
  parseCookies,
  verifyPassword,
  verifySessionToken,
} from "./security.mjs";

const { Client } = ssh2;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(WEB_ROOT, "dist");
const PORT = Number(process.env.MGTERMINAL_PORT || 8080);
const HOST = process.env.MGTERMINAL_HOST || "0.0.0.0";
const DATA_DIR = path.resolve(process.env.MGTERMINAL_DATA_DIR || path.join(WEB_ROOT, "data"));
const SESSION_SECRET = String(process.env.MGTERMINAL_SESSION_SECRET || "");
const ADMIN_PASSWORD = String(process.env.MGTERMINAL_ADMIN_PASSWORD || "");
const COOKIE_NAME = "mgterminal_session";
const MAX_JSON_BODY = 1024 * 1024;
const LOGIN_LIMIT_WINDOW = 15 * 60 * 1000;
const LOGIN_LIMIT_ATTEMPTS = 10;

if (SESSION_SECRET.length < 32) {
  throw new Error("MGTERMINAL_SESSION_SECRET 必须至少 32 个字符");
}
if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  throw new Error("找不到 web/dist/index.html，请先执行 npm run build");
}

const store = new Store(DATA_DIR, SESSION_SECRET);
const passwordHash = store.initializeAdmin(ADMIN_PASSWORD);
const loginAttempts = new Map();

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}

function json(res, status, data, headers = {}) {
  securityHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(data));
}

function errorJson(res, status, message) {
  json(res, status, { error: message });
}

function isSecureRequest(req) {
  if (process.env.MGTERMINAL_SECURE_COOKIE === "0") return false;
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return forwarded === "https" || Boolean(req.socket.encrypted);
}

function sessionCookie(token, req) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${isSecureRequest(req) ? "; Secure" : ""}`;
}

function clearSessionCookie(req) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isSecureRequest(req) ? "; Secure" : ""}`;
}

function authenticated(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  return verifySessionToken(token, SESSION_SECRET);
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BODY) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("JSON 格式无效"));
      }
    });
    req.on("error", reject);
  });
}

function clientAddress(req) {
  return req.socket.remoteAddress || "unknown";
}

function loginAllowed(req) {
  const key = clientAddress(req);
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((time) => now - time < LOGIN_LIMIT_WINDOW);
  loginAttempts.set(key, recent);
  return recent.length < LOGIN_LIMIT_ATTEMPTS;
}

function registerFailedLogin(req) {
  const key = clientAddress(req);
  const recent = loginAttempts.get(key) || [];
  recent.push(Date.now());
  loginAttempts.set(key, recent);
}

function clearLoginAttempts(req) {
  loginAttempts.delete(clientAddress(req));
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, { ok: true, service: "MgTerminal Web" });
  }
  if (req.method === "GET" && url.pathname === "/api/session") {
    return json(res, 200, { authenticated: authenticated(req) });
  }
  if (req.method === "POST" && url.pathname === "/api/login") {
    if (!loginAllowed(req)) return errorJson(res, 429, "登录失败次数过多，请 15 分钟后重试");
    const body = await readJson(req);
    if (!verifyPassword(String(body.password || ""), passwordHash)) {
      registerFailedLogin(req);
      return errorJson(res, 401, "密码错误");
    }
    clearLoginAttempts(req);
    const token = createSessionToken(SESSION_SECRET);
    return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(token, req) });
  }
  if (req.method === "POST" && url.pathname === "/api/logout") {
    return json(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(req) });
  }
  if (!authenticated(req)) return errorJson(res, 401, "请先登录");

  if (req.method === "GET" && url.pathname === "/api/hosts") {
    return json(res, 200, { hosts: store.listHosts() });
  }
  if (req.method === "POST" && url.pathname === "/api/hosts") {
    const host = store.createHost(await readJson(req));
    return json(res, 201, { host });
  }
  const hostMatch = url.pathname.match(/^\/api\/hosts\/([0-9a-f-]+)$/i);
  if (hostMatch && req.method === "PUT") {
    const host = store.updateHost(hostMatch[1], await readJson(req));
    if (!host) return errorJson(res, 404, "主机不存在");
    return json(res, 200, { host });
  }
  if (hostMatch && req.method === "DELETE") {
    if (!store.deleteHost(hostMatch[1])) return errorJson(res, 404, "主机不存在");
    return json(res, 200, { ok: true });
  }
  return errorJson(res, 404, "接口不存在");
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const candidate = path.resolve(DIST_DIR, `.${pathname}`);
  const file = candidate.startsWith(`${DIST_DIR}${path.sep}`) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(DIST_DIR, "index.html");
  securityHeaders(res);
  res.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream",
    "Cache-Control": file.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    console.error("HTTP request failed", error);
    if (!res.headersSent) errorJson(res, 400, error.message || "请求失败");
    else res.end();
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let sameOrigin = false;
  try {
    sameOrigin = new URL(String(req.headers.origin || "")).host === String(req.headers.host || "");
  } catch {
    sameOrigin = false;
  }
  if (url.pathname !== "/ws/terminal" || !sameOrigin || !authenticated(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws) => {
  let ssh = null;
  let stream = null;
  let pendingHostKey = null;
  let requestedHost = null;

  const send = (message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  const cleanup = () => {
    try { stream?.end(); } catch {}
    try { ssh?.end(); } catch {}
    stream = null;
    ssh = null;
  };

  function connect(host, allowNewFingerprint = false) {
    cleanup();
    requestedHost = host;
    ssh = new Client();
    ssh.on("ready", () => {
      ssh.shell({ term: "xterm-256color", cols: 120, rows: 32 }, (error, shell) => {
        if (error) {
          send({ type: "error", message: error.message });
          cleanup();
          return;
        }
        stream = shell;
        send({ type: "ready", host: { id: host.id, name: host.name } });
        shell.on("data", (data) => send({ type: "data", data: data.toString("base64") }));
        shell.stderr?.on("data", (data) => send({ type: "data", data: data.toString("base64") }));
        shell.on("close", () => {
          send({ type: "exit" });
          cleanup();
        });
      });
    });
    ssh.on("keyboard-interactive", (_name, _instructions, _language, prompts, finish) => {
      finish(prompts.map(() => host.secret.password || ""));
    });
    ssh.on("error", (error) => {
      if (pendingHostKey && /host denied|verification failed/i.test(String(error.message || ""))) return;
      send({ type: "error", message: error.message });
    });
    ssh.on("close", () => { if (stream) send({ type: "exit" }); });

    const config = {
      host: host.hostname,
      port: host.port,
      username: host.username,
      password: host.secret.password || undefined,
      privateKey: host.secret.privateKey || undefined,
      passphrase: host.secret.passphrase || undefined,
      tryKeyboard: Boolean(host.secret.password),
      readyTimeout: 20000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
      hostHash: "sha256",
      hostVerifier: (keyHash, callback) => {
        const fingerprint = `SHA256:${Buffer.from(keyHash, "hex").toString("base64").replace(/=+$/, "")}`;
        if (host.hostKey === fingerprint) return callback(true);
        if (allowNewFingerprint && pendingHostKey === fingerprint) {
          store.setHostKey(host.id, fingerprint);
          host.hostKey = fingerprint;
          pendingHostKey = null;
          return callback(true);
        }
        pendingHostKey = fingerprint;
        send({ type: "host-key", fingerprint, changed: Boolean(host.hostKey), previous: host.hostKey });
        callback(false);
      },
    };
    ssh.connect(config);
  }

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "connect") {
        const host = store.getHost(String(message.hostId || ""));
        if (!host) return send({ type: "error", message: "主机不存在" });
        connect(host, false);
      } else if (message.type === "trust-host-key") {
        if (!requestedHost || !pendingHostKey || message.fingerprint !== pendingHostKey) {
          return send({ type: "error", message: "主机指纹确认已失效，请重新连接" });
        }
        const host = store.getHost(requestedHost.id);
        if (!host) return send({ type: "error", message: "主机不存在" });
        connect(host, true);
      } else if (message.type === "input" && stream) {
        stream.write(String(message.data || ""));
      } else if (message.type === "resize" && stream) {
        const cols = Math.max(20, Math.min(500, Number(message.cols) || 120));
        const rows = Math.max(5, Math.min(300, Number(message.rows) || 32));
        stream.setWindow(rows, cols, 0, 0);
      } else if (message.type === "disconnect") {
        cleanup();
      }
    } catch (error) {
      send({ type: "error", message: error.message || "消息格式无效" });
    }
  });
  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

server.listen(PORT, HOST, () => {
  console.log(`MgTerminal Web listening on http://${HOST}:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});

function shutdown() {
  for (const client of wss.clients) client.close(1001, "Server shutdown");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
