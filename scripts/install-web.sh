#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${MGTERMINAL_REPO:-jing6616011111/MgTerminal}"
BRANCH="${MGTERMINAL_BRANCH:-main}"
INSTALL_DIR="${MGTERMINAL_INSTALL_DIR:-/opt/mgterminal-web}"
WEB_PORT="${MGTERMINAL_WEB_PORT:-8080}"
ADMIN_PASSWORD="${MGTERMINAL_ADMIN_PASSWORD:-}"

log() { printf '\033[1;32m[MgTerminal]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[警告]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[错误]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
MgTerminal Web 一键安装脚本

用法: bash install-web.sh [选项]
  --repo OWNER/REPO   GitHub 仓库（默认: ${REPO}）
  --branch BRANCH     安装分支或标签（默认: ${BRANCH}）
  --dir PATH          安装目录（默认: ${INSTALL_DIR}）
  --port PORT         Web 访问端口（默认: ${WEB_PORT}）
  --password VALUE    首次管理员密码（也可使用 MGTERMINAL_ADMIN_PASSWORD）
  -h, --help          显示帮助

示例:
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install-web.sh | bash
USAGE
}

while (($#)); do
  case "$1" in
    --repo) REPO="${2:?缺少仓库}"; shift 2 ;;
    --branch) BRANCH="${2:?缺少分支}"; shift 2 ;;
    --dir) INSTALL_DIR="${2:?缺少目录}"; shift 2 ;;
    --port) WEB_PORT="${2:?缺少端口}"; shift 2 ;;
    --password) ADMIN_PASSWORD="${2:?缺少密码}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: $1" ;;
  esac
done

[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "仓库格式必须是 OWNER/REPO"
[[ "$WEB_PORT" =~ ^[0-9]+$ ]] && ((WEB_PORT >= 1 && WEB_PORT <= 65535)) || die "端口必须在 1-65535 之间"
[[ "$(uname -s)" == "Linux" ]] || die "一键脚本仅支持 Linux 服务器"

if [[ $(id -u) -eq 0 ]]; then
  SUDO=()
  COMMAND_PREFIX=""
else
  command -v sudo >/dev/null 2>&1 || die "请使用 root 运行，或先安装 sudo"
  SUDO=(sudo)
  COMMAND_PREFIX="sudo "
fi
as_root() { "${SUDO[@]}" "$@"; }

install_base_tools() {
  local missing=()
  for tool in curl git openssl; do command -v "$tool" >/dev/null 2>&1 || missing+=("$tool"); done
  ((${#missing[@]} == 0)) && return
  log "安装基础工具: ${missing[*]}"
  if command -v apt-get >/dev/null 2>&1; then
    as_root apt-get update
    as_root apt-get install -y ca-certificates curl git openssl
  elif command -v dnf >/dev/null 2>&1; then
    as_root dnf install -y ca-certificates curl git openssl
  elif command -v yum >/dev/null 2>&1; then
    as_root yum install -y ca-certificates curl git openssl
  else
    die "无法自动安装 curl/git/openssl，请先手动安装"
  fi
}

install_docker() {
  command -v docker >/dev/null 2>&1 && return
  log "未检测到 Docker，使用 Docker 官方安装脚本安装"
  local installer
  installer="$(mktemp)"
  curl -fsSL https://get.docker.com -o "$installer"
  as_root sh "$installer"
  rm -f "$installer"
  as_root systemctl enable --now docker 2>/dev/null || true
}

detect_public_ipv4() {
  local endpoint ip
  for endpoint in \
    "https://api.ipify.org" \
    "https://ifconfig.me/ip" \
    "https://icanhazip.com"; do
    ip="$(curl -4fsS --max-time 5 "$endpoint" 2>/dev/null | tr -d '[:space:]' || true)"
    if [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
      printf '%s' "$ip"
      return 0
    fi
  done
  return 1
}

install_base_tools
install_docker
as_root docker compose version >/dev/null 2>&1 || die "Docker Compose 插件不可用，请安装 docker-compose-plugin"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "更新现有代码: $INSTALL_DIR"
  as_root git -C "$INSTALL_DIR" fetch --prune origin
  as_root git -C "$INSTALL_DIR" checkout "$BRANCH"
  as_root git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
  log "克隆 ${REPO}@${BRANCH} 到 $INSTALL_DIR"
  as_root mkdir -p "$(dirname "$INSTALL_DIR")"
  as_root git clone --branch "$BRANCH" --depth 1 "https://github.com/${REPO}.git" "$INSTALL_DIR"
fi

ENV_FILE="$INSTALL_DIR/.env.web"
FIRST_INSTALL=0
if [[ ! -f "$ENV_FILE" ]]; then
  FIRST_INSTALL=1
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
  fi
  ((${#ADMIN_PASSWORD} >= 12)) || die "管理员密码必须至少 12 位"
  SESSION_SECRET="$(openssl rand -hex 48)"
  as_root sh -c 'umask 077; cat > "$1"' _ "$ENV_FILE" <<ENV
MGTERMINAL_ADMIN_PASSWORD=${ADMIN_PASSWORD}
MGTERMINAL_SESSION_SECRET=${SESSION_SECRET}
MGTERMINAL_WEB_PORT=${WEB_PORT}
ENV
else
  log "保留现有配置与数据"
  if grep -q '^MGTERMINAL_WEB_PORT=' "$ENV_FILE"; then
    as_root sed -i.bak "s/^MGTERMINAL_WEB_PORT=.*/MGTERMINAL_WEB_PORT=${WEB_PORT}/" "$ENV_FILE"
    as_root rm -f "${ENV_FILE}.bak"
  else
    printf 'MGTERMINAL_WEB_PORT=%s\n' "$WEB_PORT" | as_root tee -a "$ENV_FILE" >/dev/null
  fi
fi

log "构建并启动 MgTerminal Web（首次构建可能需要数分钟）"
cd "$INSTALL_DIR"
as_root docker compose --env-file .env.web -f docker-compose.web.yml up -d --build

log "等待服务健康检查"
healthy=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 2
done
if ((healthy == 0)); then
  as_root docker compose --env-file .env.web -f docker-compose.web.yml logs --tail=100
  die "服务未能通过健康检查"
fi

# 管理员密码已经 scrypt 哈希写入持久卷，移除环境文件中的明文后重建容器。
if ((FIRST_INSTALL == 1)); then
  as_root sed -i.bak '/^MGTERMINAL_ADMIN_PASSWORD=/d' "$ENV_FILE"
  as_root rm -f "${ENV_FILE}.bak"
  as_root docker compose --env-file .env.web -f docker-compose.web.yml up -d
fi

LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
[[ -n "$LOCAL_IP" ]] || LOCAL_IP="服务器内网IP"
PUBLIC_IP="$(detect_public_ipv4 || true)"
printf '\n\033[1;32m安装完成！\033[0m\n'
printf '内网地址: http://%s:%s\n' "$LOCAL_IP" "$WEB_PORT"
if [[ -n "$PUBLIC_IP" ]]; then
  printf '公网候选地址: http://%s:%s\n' "$PUBLIC_IP" "$WEB_PORT"
else
  printf '公网候选地址: 未能自动检测\n'
fi
if ((FIRST_INSTALL == 1)); then
  printf '管理员密码: \033[1;33m%s\033[0m\n' "$ADMIN_PASSWORD"
  printf '请立即保存密码；安装脚本不会再次显示。\n'
fi
printf '\n管理命令:\n'
printf '  cd %s && %sdocker compose --env-file .env.web -f docker-compose.web.yml logs -f\n' "$INSTALL_DIR" "$COMMAND_PREFIX"
printf '  cd %s && %sdocker compose --env-file .env.web -f docker-compose.web.yml restart\n' "$INSTALL_DIR" "$COMMAND_PREFIX"
warn "当前地址是 HTTP。跨公网使用前必须配置 HTTPS 反向代理，或仅通过 WireGuard/Tailscale 等 VPN 访问。"
warn "公网候选地址不代表端口已经开放；云服务器还需放行安全组/防火墙，NAT 主机还需配置端口映射。"
