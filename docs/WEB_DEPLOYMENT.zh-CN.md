# MgTerminal Web 服务器部署

MgTerminal Web 是本 Fork 新增的浏览器管理模式。它在服务器上运行 SSH 代理和 Web 服务，用户通过浏览器登录后管理远程 Linux 主机。

## 能力

- 管理员密码登录，12 小时 HttpOnly / SameSite 会话；
- SSH 密码或私钥登录；
- WebSocket 实时终端与窗口尺寸同步；
- SSH 主机指纹 TOFU 确认及变更警告；
- SSH 凭据使用 AES-256-GCM 加密后保存在 Docker Volume；
- 浏览器 API 不返回 SSH 密码和私钥；
- Docker Compose 一键部署，容器默认移除全部 Linux capabilities。

> 当前 Web MVP 聚焦主机管理和实时 SSH 终端。原 Electron 客户端中的 SFTP、端口转发、AI Agent、云同步等高级模块尚未迁移到 Web 模式。

## 一键安装

在 Ubuntu、Debian、Rocky Linux、AlmaLinux 等常见 Linux 服务器执行：

```bash
curl -fsSL https://raw.githubusercontent.com/jing6616011111/MgTerminal/main/scripts/install-web.sh | sudo bash
```

安装脚本会：

1. 检查并安装 Docker；
2. 克隆仓库到 `/opt/mgterminal-web`；
3. 自动生成管理员密码和 96 位会话/加密密钥；
4. 编译 Web 前端并构建 Docker 镜像；
5. 启动服务并显示访问地址和一次性管理员密码；
6. 首次初始化成功后，从 `.env.web` 删除管理员明文密码。

自定义端口：

```bash
curl -fsSL https://raw.githubusercontent.com/jing6616011111/MgTerminal/main/scripts/install-web.sh \
  | sudo bash -s -- --port 9000
```

指定管理员密码：

```bash
curl -fsSL https://raw.githubusercontent.com/jing6616011111/MgTerminal/main/scripts/install-web.sh \
  | sudo MGTERMINAL_ADMIN_PASSWORD='至少12位的强密码' bash
```

## 手动 Docker 部署

```bash
git clone https://github.com/jing6616011111/MgTerminal.git
cd MgTerminal
cp .env.web.example .env.web
# 编辑 .env.web，设置强密码和随机密钥
sudo docker compose --env-file .env.web -f docker-compose.web.yml up -d --build
```

首次登录完成后，管理员密码已使用 scrypt 哈希保存到数据卷，可删除 `.env.web` 中的 `MGTERMINAL_ADMIN_PASSWORD` 后重新执行 `docker compose up -d`。

## HTTPS（必须阅读）

SSH 密码和私钥会由浏览器提交到服务器。**公网环境绝不能直接使用 HTTP**。推荐：

- 使用 Caddy、Nginx Proxy Manager 或 Traefik 反向代理到 `127.0.0.1:8080` 并启用 HTTPS；
- 或者仅在 WireGuard、Tailscale、ZeroTier 等可信 VPN 内访问；
- 防火墙只开放反向代理的 443，避免直接公开 8080。

反向代理必须支持 WebSocket，并转发：

```text
Upgrade: websocket
Connection: upgrade
X-Forwarded-Proto: https
```

服务检测到 `X-Forwarded-Proto: https` 后会自动给登录 Cookie 添加 `Secure`。

## 数据与备份

数据保存在 Docker Volume `mgterminal-web-data`：

- `admin.json`：scrypt 管理员密码哈希；
- `hosts.json`：主机信息及 AES-256-GCM 加密凭据。

必须同时备份 `.env.web` 中的 `MGTERMINAL_SESSION_SECRET`。如果丢失或更换该密钥，已有 SSH 凭据将无法解密。

## 更新

重新执行一键安装命令即可拉取最新代码并重建：

```bash
curl -fsSL https://raw.githubusercontent.com/jing6616011111/MgTerminal/main/scripts/install-web.sh | sudo bash
```

## 运维命令

```bash
cd /opt/mgterminal-web
sudo docker compose --env-file .env.web -f docker-compose.web.yml ps
sudo docker compose --env-file .env.web -f docker-compose.web.yml logs -f
sudo docker compose --env-file .env.web -f docker-compose.web.yml restart
sudo docker compose --env-file .env.web -f docker-compose.web.yml down
```
