"use strict";

/**
 * Bootstrap for external MCP clients.
 * Reads the external discovery file written by MagiesTerminal, sets env, then
 * loads the existing catalog-backed stdio MCP server.
 */

const fs = require("node:fs");
const path = require("node:path");

const {
  resolveExistingExternalMcpDiscoveryFilePath,
  EXTERNAL_MCP_CHAT_SESSION_ID,
} = require("../cli/externalMcpDiscoveryPath.cjs");
const { readExternalDiscovery } = require("../cli/externalMcpDiscovery.cjs");

function resolveDiscoveryPath() {
  return resolveExistingExternalMcpDiscoveryFilePath();
}

function main() {
  const discoveryPath = resolveDiscoveryPath();
  if (!fs.existsSync(discoveryPath)) {
    process.stderr.write(
      `[magies-terminal-external-mcp] Discovery file not found at ${discoveryPath}. ` +
      "Enable External MCP in MagiesTerminal Settings → AI and keep the app running.\n",
    );
    process.exit(1);
  }

  let discovery;
  try {
    discovery = readExternalDiscovery(discoveryPath);
  } catch (error) {
    process.stderr.write(
      `[magies-terminal-external-mcp] Failed to read discovery: ${error?.message || error}\n`,
    );
    process.exit(1);
  }

  process.env.MAGIES_TERMINAL_EXTERNAL_MCP_DISCOVERY_FILE = discoveryPath;
  process.env.MAGIES_TERMINAL_MCP_PORT = String(discovery.port);
  process.env.MAGIES_TERMINAL_MCP_TOKEN = discovery.token;
  process.env.MAGIES_TERMINAL_MCP_CHAT_SESSION_ID = discovery.chatSessionId || EXTERNAL_MCP_CHAT_SESSION_ID;
  process.env.MAGIES_TERMINAL_MCP_PERMISSION_MODE = discovery.permissionMode || "confirm";

  // Load after env is set — magies-terminal-mcp-server reads env at module load.
  require(path.join(__dirname, "magies-terminal-mcp-server.cjs"));
}

main();
