const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  buildMagiesTerminalSkillsOpenCodePathAllowlist,
  buildOpenCodeNativeSkillEnvDenyPatterns,
  buildOpenCodeNativeSkillPermissionPatterns,
  buildOpenCodeNativeSkillsPermissionRules,
  buildOpenCodeSkillsPermissionRules,
  toOpenCodeDirectoryPermissionPatterns,
  toOpenCodeDirectoryGlob,
  toOpenCodeFileParentPermissionPatterns,
  toOpenCodeFileParentGlob,
} = require("./magiesTerminalSkillsOpenCodePermissions.cjs");

// Mirrors OpenCode's Wildcard.match (packages/core/src/util/wildcard.ts):
// inputs and patterns are normalized to forward slashes, "*" matches any
// run of characters, and matching is anchored to the whole string.
function openCodeWildcardMatch(input, pattern) {
  const normalized = input.replaceAll("\\", "/");
  const escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "s").test(normalized);
}

function matchesAnyPattern(input, patterns) {
  return patterns.some((pattern) => openCodeWildcardMatch(input, pattern));
}

// Mirrors OpenCode's Permission.evaluate: rules come from Object.entries of
// the config map in insertion order, and the last matching rule wins.
function evaluateOpenCodeRuleMap(input, ruleMap) {
  let action;
  for (const [pattern, ruleAction] of Object.entries(ruleMap)) {
    if (openCodeWildcardMatch(input, pattern)) action = ruleAction;
  }
  return action;
}

test("toOpenCodeFileParentGlob maps files to parent directory globs", () => {
  assert.equal(
    toOpenCodeFileParentGlob("/Applications/MagiesTerminal.app/Contents/MacOS/magies-terminal-tool-cli"),
    "/Applications/MagiesTerminal.app/Contents/MacOS/**",
  );
  assert.equal(
    toOpenCodeFileParentGlob("/tmp/magiesTerminal/skills/magies-terminal-tool-cli/SKILL.md"),
    "/tmp/magiesTerminal/skills/magies-terminal-tool-cli/**",
  );
});

test("toOpenCodeDirectoryGlob keeps directory roots stable when missing on disk", () => {
  assert.equal(
    toOpenCodeDirectoryGlob("/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli"),
    "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/**",
  );
});

test("toOpenCodeDirectoryPermissionPatterns includes exact and wildcard forms", () => {
  assert.deepEqual(
    toOpenCodeDirectoryPermissionPatterns("/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli"),
    [
      "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli",
      "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/*",
      "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/**",
    ],
  );
});

test("toOpenCodeFileParentPermissionPatterns normalizes Windows paths", () => {
  assert.deepEqual(
    toOpenCodeFileParentPermissionPatterns(
      "C:\\Users\\me\\AppData\\Local\\Programs\\MagiesTerminal\\resources\\app.asar.unpacked\\electron\\cli\\magies-terminal-tool-cli.cmd",
      { platform: "win32", pathModule: path.win32 },
    ),
    [
      "C:/Users/me/AppData/Local/Programs/MagiesTerminal/resources/app.asar.unpacked/electron/cli",
      "C:/Users/me/AppData/Local/Programs/MagiesTerminal/resources/app.asar.unpacked/electron/cli/*",
      "C:/Users/me/AppData/Local/Programs/MagiesTerminal/resources/app.asar.unpacked/electron/cli/**",
    ],
  );
});

test("buildMagiesTerminalSkillsOpenCodePathAllowlist dedupes launcher and script roots", () => {
  const launcher = "/Applications/MagiesTerminal.app/Contents/MacOS/magies-terminal-tool-cli";
  const script = "/Applications/MagiesTerminal.app/Contents/Resources/app.asar.unpacked/electron/cli/magies-terminal-tool-cli.cjs";
  const skill = "/Applications/MagiesTerminal.app/Contents/Resources/app.asar.unpacked/skills/magies-terminal-tool-cli/SKILL.md";
  const patterns = buildMagiesTerminalSkillsOpenCodePathAllowlist({
    launcherPath: launcher,
    cliScriptPath: script,
    skillPath: skill,
    discoveryFilePath: "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/discovery.json",
    cliStateDir: "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli",
  });

  assert.deepEqual(patterns, [
    "/Applications/MagiesTerminal.app/Contents/MacOS",
    "/Applications/MagiesTerminal.app/Contents/MacOS/*",
    "/Applications/MagiesTerminal.app/Contents/MacOS/**",
    "/Applications/MagiesTerminal.app/Contents/Resources/app.asar.unpacked/electron/cli",
    "/Applications/MagiesTerminal.app/Contents/Resources/app.asar.unpacked/electron/cli/*",
    "/Applications/MagiesTerminal.app/Contents/Resources/app.asar.unpacked/electron/cli/**",
    "/Applications/MagiesTerminal.app/Contents/Resources/app.asar.unpacked/skills/magies-terminal-tool-cli",
    "/Applications/MagiesTerminal.app/Contents/Resources/app.asar.unpacked/skills/magies-terminal-tool-cli/*",
    "/Applications/MagiesTerminal.app/Contents/Resources/app.asar.unpacked/skills/magies-terminal-tool-cli/**",
    "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli",
    "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/*",
    "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/**",
  ]);
});

test("buildMagiesTerminalSkillsOpenCodePathAllowlist includes temp dir and extra attachment paths", () => {
  const patterns = buildMagiesTerminalSkillsOpenCodePathAllowlist({
    discoveryFilePath: "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/discovery.json",
    tempDir: "/var/folders/tmp/MagiesTerminal",
    extraFilePaths: ["/var/folders/tmp/MagiesTerminal/ai-attachment-1.png"],
  });

  assert.deepEqual(patterns, [
    "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli",
    "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/*",
    "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/**",
    "/var/folders/tmp/MagiesTerminal",
    "/var/folders/tmp/MagiesTerminal/*",
    "/var/folders/tmp/MagiesTerminal/**",
  ]);
});

test("buildMagiesTerminalSkillsOpenCodePathAllowlist includes OpenCode-compatible Windows directory resources", () => {
  const patterns = buildMagiesTerminalSkillsOpenCodePathAllowlist({
    launcherPath: "C:\\Users\\me\\AppData\\Local\\Programs\\MagiesTerminal\\resources\\app.asar.unpacked\\electron\\cli\\magies-terminal-tool-cli.cmd",
    cliScriptPath: "C:\\Users\\me\\AppData\\Local\\Programs\\MagiesTerminal\\resources\\app.asar.unpacked\\electron\\cli\\magies-terminal-tool-cli.cjs",
    skillPath: "C:\\Users\\me\\AppData\\Local\\Programs\\MagiesTerminal\\resources\\app.asar.unpacked\\skills\\magies-terminal-tool-cli\\SKILL.md",
    discoveryFilePath: "C:\\Users\\me\\AppData\\Roaming\\magiesTerminal\\magies-terminal-tool-cli\\discovery.json",
    runtimeBinaryPath: "C:\\Users\\me\\AppData\\Local\\Programs\\MagiesTerminal\\MagiesTerminal.exe",
    tempDir: "C:\\Users\\me\\AppData\\Local\\Temp\\MagiesTerminal",
    extraFilePaths: ["C:\\Users\\me\\AppData\\Local\\Temp\\MagiesTerminal\\attachment.png"],
  }, { platform: "win32", pathModule: path.win32 });

  assert.equal(patterns.includes("C:/Users/me/AppData/Local/Programs/MagiesTerminal/resources/app.asar.unpacked/electron/cli/*"), true);
  assert.equal(patterns.includes("C:/Users/me/AppData/Roaming/magiesTerminal/magies-terminal-tool-cli/*"), true);
  assert.equal(patterns.includes("C:/Users/me/AppData/Local/Temp/MagiesTerminal/*"), true);
  assert.equal(patterns.includes("C:/Users/me/AppData/Local/Programs/MagiesTerminal/*"), true);
});

test("buildOpenCodeSkillsPermissionRules allowlists MagiesTerminal CLI paths and denies other external access", () => {
  const rules = buildOpenCodeSkillsPermissionRules([
    "/Applications/MagiesTerminal.app/Contents/MacOS/**",
    "/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/**",
  ]);

  assert.equal(rules.bash, "allow");
  assert.equal(rules.skill, "allow");
  assert.equal(rules.list, "deny");
  assert.equal(rules.external_directory["*"], "deny");
  assert.equal(rules.external_directory["/Applications/MagiesTerminal.app/Contents/MacOS/**"], "allow");
  assert.equal(rules.external_directory["/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/**"], "allow");
  assert.equal(rules.read["/Applications/MagiesTerminal.app/Contents/MacOS/**"], "allow");
  assert.equal(rules.read["/Users/me/Library/Application Support/magiesTerminal/magies-terminal-tool-cli/**"], "allow");
  assert.equal(rules.read["*"], undefined);
  // Allowlist entries must come after the catch-all deny so OpenCode's
  // last-matching-rule-wins evaluation keeps them effective.
  assert.equal(Object.keys(rules.external_directory)[0], "*");
});

test("buildOpenCodeNativeSkillsPermissionRules keeps OpenCode native skill dirs readable", () => {
  const rules = buildOpenCodeNativeSkillsPermissionRules();
  assert.equal(rules.skill, "allow");
  assert.equal(rules.external_directory["*"], "deny");
  for (const pattern of buildOpenCodeNativeSkillPermissionPatterns()) {
    assert.equal(rules.external_directory[pattern], "allow");
    assert.equal(rules.read[pattern], "allow");
  }
  for (const pattern of buildOpenCodeNativeSkillEnvDenyPatterns()) {
    assert.equal(rules.read[pattern], "deny");
  }
});

test("native skill read rules re-deny dot-env files inside skill dirs (last match wins)", () => {
  const { read } = buildOpenCodeNativeSkillsPermissionRules();

  // Regular skill files stay allowed.
  assert.equal(evaluateOpenCodeRuleMap("../../.opencode/skills/foo/references/doc.md", read), "allow");
  assert.equal(evaluateOpenCodeRuleMap("C:/Users/me/.config/opencode/skills/foo/SKILL.md", read), "allow");

  // Dot-env secret files under skill dirs must not be silently readable.
  assert.equal(evaluateOpenCodeRuleMap("../../.opencode/skills/foo/.env", read), "deny");
  assert.equal(evaluateOpenCodeRuleMap("C:/Users/me/.config/opencode/skills/foo/.env", read), "deny");
  assert.equal(evaluateOpenCodeRuleMap("/home/me/.claude/skills/foo/.env.local", read), "deny");
  assert.equal(evaluateOpenCodeRuleMap("..\\..\\.agents\\skills\\foo\\references\\prod.env", read), "deny");
});

test("native skill patterns match OpenCode permission requests for skill files (issue #1939)", () => {
  const patterns = buildOpenCodeNativeSkillPermissionPatterns();

  // external_directory asks with an absolute parent-directory glob
  // (forward slashes on Windows after FSUtil.normalizePathPattern).
  assert.equal(matchesAnyPattern("C:/Users/me/.opencode/skills/my-skill/references/*", patterns), true);
  assert.equal(matchesAnyPattern("/home/me/.config/opencode/skills/my-skill/*", patterns), true);
  assert.equal(matchesAnyPattern("/Users/me/.claude/skills/my-skill/references/*", patterns), true);
  assert.equal(matchesAnyPattern("/Users/me/.agents/skills/my-skill/*", patterns), true);
  assert.equal(matchesAnyPattern("/Users/me/.cache/opencode/skills/abc123/my-skill/*", patterns), true);

  // read asks with a worktree-relative path (Windows backslashes included).
  assert.equal(matchesAnyPattern("..\\..\\.opencode\\skills\\my-skill\\references\\doc.md", patterns), true);
  assert.equal(matchesAnyPattern("../.config/opencode/skills/my-skill/SKILL.md", patterns), true);
  assert.equal(matchesAnyPattern(".opencode/skills/my-skill/references/doc.md", patterns), true);

  // unrelated external paths stay denied
  assert.equal(matchesAnyPattern("C:/Users/me/Documents/secret.txt/*", patterns), false);
  assert.equal(matchesAnyPattern("../../etc/passwd", patterns), false);
  assert.equal(matchesAnyPattern("C:/Users/me/.ssh/id_rsa", patterns), false);
});
