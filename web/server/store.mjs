import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { decryptJson, encryptJson, hashPassword } from "./security.mjs";

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function normalizePort(value) {
  const port = Number(value || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SSH 端口必须在 1-65535 之间");
  return port;
}

function validatePublicHost(input) {
  const name = String(input.name || "").trim();
  const hostname = String(input.hostname || "").trim();
  const username = String(input.username || "").trim();
  if (!name || name.length > 80) throw new Error("主机名称不能为空且不能超过 80 个字符");
  if (!hostname || hostname.length > 255 || /[\s/]/.test(hostname)) throw new Error("SSH 主机地址无效");
  if (!username || username.length > 128 || /[\r\n]/.test(username)) throw new Error("SSH 用户名无效");
  return {
    name,
    hostname,
    port: normalizePort(input.port),
    username,
    color: /^#[0-9a-f]{6}$/i.test(input.color || "") ? input.color : "#52d3a5",
  };
}

function publicView(host) {
  return {
    id: host.id,
    name: host.name,
    hostname: host.hostname,
    port: host.port,
    username: host.username,
    color: host.color,
    hostKey: host.hostKey || null,
    hasPassword: Boolean(host.secret?.password),
    hasPrivateKey: Boolean(host.secret?.privateKey),
    createdAt: host.createdAt,
    updatedAt: host.updatedAt,
  };
}

export class Store {
  constructor(dataDir, secret) {
    this.dataDir = dataDir;
    this.secret = secret;
    this.adminFile = path.join(dataDir, "admin.json");
    this.hostsFile = path.join(dataDir, "hosts.json");
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  }

  initializeAdmin(initialPassword) {
    const existing = readJson(this.adminFile, null);
    if (existing?.passwordHash) return existing.passwordHash;
    if (!initialPassword || initialPassword.length < 12) {
      throw new Error("首次启动必须设置至少 12 位的 MGTERMINAL_ADMIN_PASSWORD");
    }
    const passwordHash = hashPassword(initialPassword);
    atomicWrite(this.adminFile, { passwordHash, createdAt: new Date().toISOString() });
    return passwordHash;
  }

  readHosts() {
    const rows = readJson(this.hostsFile, []);
    if (!Array.isArray(rows)) throw new Error("hosts.json 格式无效");
    return rows.map((row) => ({
      ...row,
      secret: row.credentials ? decryptJson(row.credentials, this.secret) : {},
    }));
  }

  writeHosts(hosts) {
    atomicWrite(this.hostsFile, hosts.map(({ secret = {}, ...host }) => ({
      ...host,
      credentials: encryptJson(secret, this.secret),
    })));
  }

  listHosts() {
    return this.readHosts().map(publicView);
  }

  getHost(id) {
    return this.readHosts().find((host) => host.id === id) || null;
  }

  createHost(input) {
    const hosts = this.readHosts();
    const now = new Date().toISOString();
    const host = {
      id: crypto.randomUUID(),
      ...validatePublicHost(input),
      hostKey: null,
      secret: {
        password: String(input.password || ""),
        privateKey: String(input.privateKey || ""),
        passphrase: String(input.passphrase || ""),
      },
      createdAt: now,
      updatedAt: now,
    };
    if (!host.secret.password && !host.secret.privateKey) throw new Error("请提供 SSH 密码或私钥");
    hosts.push(host);
    this.writeHosts(hosts);
    return publicView(host);
  }

  updateHost(id, input) {
    const hosts = this.readHosts();
    const index = hosts.findIndex((host) => host.id === id);
    if (index < 0) return null;
    const previous = hosts[index];
    const nextPublic = validatePublicHost({ ...previous, ...input });
    const endpointChanged = previous.hostname !== nextPublic.hostname || previous.port !== nextPublic.port;
    const next = {
      ...previous,
      ...nextPublic,
      hostKey: endpointChanged ? null : previous.hostKey,
      secret: {
        password: input.password === undefined || input.password === "" ? previous.secret.password : String(input.password),
        privateKey: input.privateKey === undefined || input.privateKey === "" ? previous.secret.privateKey : String(input.privateKey),
        passphrase: input.passphrase === undefined || input.passphrase === "" ? previous.secret.passphrase : String(input.passphrase),
      },
      updatedAt: new Date().toISOString(),
    };
    if (input.clearPassword) next.secret.password = "";
    if (input.clearPrivateKey) {
      next.secret.privateKey = "";
      next.secret.passphrase = "";
    }
    if (!next.secret.password && !next.secret.privateKey) throw new Error("请至少保留一种 SSH 认证方式");
    hosts[index] = next;
    this.writeHosts(hosts);
    return publicView(next);
  }

  setHostKey(id, fingerprint) {
    const hosts = this.readHosts();
    const index = hosts.findIndex((host) => host.id === id);
    if (index < 0) return false;
    hosts[index].hostKey = fingerprint;
    hosts[index].updatedAt = new Date().toISOString();
    this.writeHosts(hosts);
    return true;
  }

  deleteHost(id) {
    const hosts = this.readHosts();
    const filtered = hosts.filter((host) => host.id !== id);
    if (filtered.length === hosts.length) return false;
    this.writeHosts(filtered);
    return true;
  }
}
