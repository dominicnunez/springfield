import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logWarning } from "../ui/logger.js";

export type EngineType = "opencode" | "claude" | "codex";
export type EffortLevel = "high" | "medium" | "low" | "xhigh";

export const DEFAULT_OC_PRIME_MODEL = "big-pickle";

export interface Config {
  // Engine
  engine: EngineType;

  // General defaults
  claudeModel: string;
  claudeEffort: EffortLevel;
  codexModel: string | undefined;
  ocPrimeModel: string;
  ocFallModel: string | undefined;

  // Rate limit handling (OpenCode)
  softLimitRetries: number;
  softLimitWait: number;

  // Ralph
  maxIterations: number;
  sleepSeconds: number;
  skipCommit: boolean;
  pushAfterCommit: boolean;
  skipTestVerify: boolean;
  maxConsecutiveFailures: number;
  testCmd: string | undefined;
  ralphModel: string | undefined;
  ralphEffort: EffortLevel | undefined;

  // Willie
  willieMaxIterations: number;
  willieAuditPrompt: string | undefined;
  willieModel: string | undefined;
  willieEffort: EffortLevel | undefined;
  lintCmd: string | undefined;

  // Logging
  logDir: string;
  progressDir: string;

  // Chaining
  auditAfterComplete: boolean;
}

// Config file paths
const GLOBAL_CONFIG_DIR = join(homedir(), ".config", "sfk");
const GLOBAL_CONFIG_FILE = join(GLOBAL_CONFIG_DIR, "config");
const PROJECT_CONFIG_DIR = ".sfk";
const PROJECT_CONFIG_FILE = join(PROJECT_CONFIG_DIR, "config");

// Legacy paths (for migration detection)
const LEGACY_GLOBAL_DIR = join(homedir(), ".config", "ralph");
const LEGACY_GLOBAL_FILE = join(LEGACY_GLOBAL_DIR, "ralph.env");
const LEGACY_PROJECT_FILE = join(".ralph", "ralph.env");

const DEFAULT_CONFIG_CONTENT = `# SFK Configuration
# Override per-project: .sfk/config

[engine]
type = opencode

[models]
claude = sonnet
effort = high               # global effort default: low|medium|high|xhigh
# Claude supports only low|medium|high and errors on xhigh
# codex =
opencode-primary = opencode/glm-5-free
# opencode-fallback =

[rate-limits]
soft-retries = 3
soft-wait = 30

[ralph]
max-iterations = 10
sleep-seconds = 2
skip-commit = false
push-after-commit = false
skip-test-verify = false
max-consecutive-failures = 3
# test-cmd =
# model = sonnet
# effort = high             # overrides the global effort for Ralph

[willie]
max-iterations = 0
# audit-prompt = audit/prompt.md
# lint-cmd =
# effort = high             # overrides the global effort for Willie

[logging]
# log-dir = ~/.sfk/logs
# progress-dir = ~/.sfk/progress
`;

/**
 * Parse INI-style config file with [section] headers.
 * Returns flat map with keys like "section.key".
 */
export function parseConfigFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentSection = "";

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    // Section header
    const sectionMatch = trimmed.match(/^\[([a-zA-Z-]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      logWarning(`Skipping malformed config line: ${line}`);
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const value = removeQuotes(
      stripInlineComment(trimmed.slice(eqIndex + 1).trim()),
    );

    const fullKey = currentSection ? `${currentSection}.${key}` : key;
    result[fullKey] = value;
  }

  return result;
}

/**
 * Parse a simple .env file format (legacy support)
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = removeQuotes(trimmed.slice(eqIndex + 1).trim());

    result[key] = value;
  }

  return result;
}

function parseBool(value: string): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function removeQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function stripInlineComment(value: string): string {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "#" && !inSingleQuote && !inDoubleQuote) {
      return value.slice(0, i).trimEnd();
    }
  }

  return value;
}

function parseIntSafe(value: string, defaultVal: number): number {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

function parseEffort(value: string): EffortLevel | undefined {
  if (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "xhigh"
  ) {
    return value;
  }
  return undefined;
}

/**
 * Apply parsed INI config values to Config object
 */
export function applyConfigToConfig(
  config: Config,
  parsed: Record<string, string>,
): void {
  // [engine]
  const engineType = parsed["engine.type"];
  if (
    engineType === "claude" ||
    engineType === "opencode" ||
    engineType === "codex"
  ) {
    config.engine = engineType;
  } else if (engineType !== undefined) {
    logWarning(
      `Unknown engine type "${engineType}" in config, using default (opencode)`,
    );
  }

  // [models]
  if (parsed["models.claude"]) config.claudeModel = parsed["models.claude"];
  if (parsed["models.effort"]) {
    const effort = parseEffort(parsed["models.effort"]);
    if (effort) config.claudeEffort = effort;
  }
  if (parsed["models.codex"]?.trim())
    config.codexModel = parsed["models.codex"];
  if (parsed["models.opencode-primary"])
    config.ocPrimeModel = parsed["models.opencode-primary"];
  if (parsed["models.opencode-fallback"]?.trim())
    config.ocFallModel = parsed["models.opencode-fallback"];

  // [rate-limits]
  if (parsed["rate-limits.soft-retries"])
    config.softLimitRetries = parseIntSafe(
      parsed["rate-limits.soft-retries"],
      3,
    );
  if (parsed["rate-limits.soft-wait"])
    config.softLimitWait = parseIntSafe(parsed["rate-limits.soft-wait"], 30);

  // [ralph]
  if (parsed["ralph.max-iterations"])
    config.maxIterations = parseIntSafe(parsed["ralph.max-iterations"], 10);
  if (parsed["ralph.sleep-seconds"])
    config.sleepSeconds = parseIntSafe(parsed["ralph.sleep-seconds"], 2);
  const skipCommit = parsed["ralph.skip-commit"];
  if (skipCommit !== undefined) {
    const val = parseBool(skipCommit);
    if (val !== undefined) config.skipCommit = val;
  }
  const pushAfterCommit = parsed["ralph.push-after-commit"];
  if (pushAfterCommit !== undefined) {
    const val = parseBool(pushAfterCommit);
    if (val !== undefined) config.pushAfterCommit = val;
  }
  const skipTestVerify = parsed["ralph.skip-test-verify"];
  if (skipTestVerify !== undefined) {
    const val = parseBool(skipTestVerify);
    if (val !== undefined) config.skipTestVerify = val;
  }
  if (parsed["ralph.max-consecutive-failures"])
    config.maxConsecutiveFailures = parseIntSafe(
      parsed["ralph.max-consecutive-failures"],
      3,
    );
  if (parsed["ralph.test-cmd"]?.trim())
    config.testCmd = parsed["ralph.test-cmd"];
  if (parsed["ralph.model"]) config.ralphModel = parsed["ralph.model"];
  if (parsed["ralph.effort"]) {
    const effort = parseEffort(parsed["ralph.effort"]);
    if (effort) config.ralphEffort = effort;
  }
  const auditAfter = parsed["ralph.audit-after-complete"];
  if (auditAfter !== undefined) {
    const val = parseBool(auditAfter);
    if (val !== undefined) config.auditAfterComplete = val;
  }

  // [willie]
  if (parsed["willie.max-iterations"])
    config.willieMaxIterations = parseIntSafe(
      parsed["willie.max-iterations"],
      0,
    );
  if (parsed["willie.audit-prompt"]?.trim())
    config.willieAuditPrompt = parsed["willie.audit-prompt"];
  if (parsed["willie.lint-cmd"]?.trim())
    config.lintCmd = parsed["willie.lint-cmd"];
  if (parsed["willie.model"]) config.willieModel = parsed["willie.model"];
  if (parsed["willie.effort"]) {
    const effort = parseEffort(parsed["willie.effort"]);
    if (effort) config.willieEffort = effort;
  }

  // [logging]
  if (parsed["logging.log-dir"]?.trim())
    config.logDir = validatePath(parsed["logging.log-dir"], "log-dir");
  if (parsed["logging.progress-dir"]?.trim())
    config.progressDir = validatePath(
      parsed["logging.progress-dir"],
      "progress-dir",
    );
}

const ALLOWED_TEMP_PATHS = ["/tmp"];

function validatePath(path: string, name: string): string {
  const resolved = path.replace(/^~/, homedir());
  const absolute = resolved.startsWith("/")
    ? resolved
    : join(process.cwd(), resolved);
  if (
    absolute.startsWith(homedir()) ||
    absolute.startsWith("/tmp/") ||
    ALLOWED_TEMP_PATHS.includes(absolute)
  ) {
    return path;
  }
  logWarning(
    `${name} path "${path}" escapes allowed directories, using default`,
  );
  return "";
}

/**
 * Apply legacy .env values to config object
 */
function applyEnvToConfig(config: Config, env: Record<string, string>): void {
  if (
    env.ENGINE === "claude" ||
    env.ENGINE === "opencode" ||
    env.ENGINE === "codex"
  )
    config.engine = env.ENGINE;
  if (env.MAX_ITERATIONS)
    config.maxIterations = parseIntSafe(env.MAX_ITERATIONS, 10);
  if (env.SLEEP_SECONDS)
    config.sleepSeconds = parseIntSafe(env.SLEEP_SECONDS, 2);
  if (env.SKIP_COMMIT !== undefined) {
    const val = parseBool(env.SKIP_COMMIT);
    if (val !== undefined) config.skipCommit = val;
  }
  if (env.PUSH_AFTER_COMMIT !== undefined) {
    const val = parseBool(env.PUSH_AFTER_COMMIT);
    if (val !== undefined) config.pushAfterCommit = val;
  }
  if (env.CLAUDE_MODEL) config.claudeModel = env.CLAUDE_MODEL;
  if (env.CODEX_MODEL?.trim()) config.codexModel = env.CODEX_MODEL;
  if (env.OC_PRIME_MODEL) config.ocPrimeModel = env.OC_PRIME_MODEL;
  if (env.OC_FALL_MODEL?.trim()) config.ocFallModel = env.OC_FALL_MODEL;
  if (env.SOFT_LIMIT_RETRIES)
    config.softLimitRetries = parseIntSafe(env.SOFT_LIMIT_RETRIES, 3);
  if (env.SOFT_LIMIT_WAIT)
    config.softLimitWait = parseIntSafe(env.SOFT_LIMIT_WAIT, 30);
  if (env.TEST_CMD?.trim()) config.testCmd = env.TEST_CMD;
  if (env.SKIP_TEST_VERIFY !== undefined) {
    const val = parseBool(env.SKIP_TEST_VERIFY);
    if (val !== undefined) config.skipTestVerify = val;
  }
  if (env.MAX_CONSECUTIVE_FAILURES)
    config.maxConsecutiveFailures = parseIntSafe(
      env.MAX_CONSECUTIVE_FAILURES,
      3,
    );
  if (env.RALPH_LOG_DIR?.trim())
    config.logDir = validatePath(env.RALPH_LOG_DIR, "log-dir");
  if (env.RALPH_PROGRESS_DIR?.trim())
    config.progressDir = validatePath(env.RALPH_PROGRESS_DIR, "progress-dir");
}

/**
 * Ensure global config exists (self-healing)
 */
function ensureGlobalConfig(): void {
  if (!existsSync(GLOBAL_CONFIG_FILE)) {
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
      mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
    }
    writeFileSync(GLOBAL_CONFIG_FILE, DEFAULT_CONFIG_CONTENT);
  }
}

/**
 * Check for legacy config and warn
 */
function checkLegacyConfig(): boolean {
  const legacyGlobal = existsSync(LEGACY_GLOBAL_FILE);
  const legacyProject = existsSync(join(process.cwd(), LEGACY_PROJECT_FILE));

  if (legacyGlobal || legacyProject) {
    const locations: string[] = [];
    if (legacyGlobal) locations.push(LEGACY_GLOBAL_FILE);
    if (legacyProject) locations.push(LEGACY_PROJECT_FILE);
    logWarning(
      `Found legacy config: ${locations.join(", ")}. ` +
        `Migrate to new format at ${GLOBAL_CONFIG_FILE}. ` +
        `See config.example for the new INI format.`,
    );
    return true;
  }
  return false;
}

function defaultConfig(): Config {
  return {
    engine: "opencode",
    claudeModel: "sonnet",
    claudeEffort: "high",
    codexModel: undefined,
    ocPrimeModel: DEFAULT_OC_PRIME_MODEL,
    ocFallModel: undefined,
    softLimitRetries: 3,
    softLimitWait: 30,
    maxIterations: 10,
    sleepSeconds: 2,
    skipCommit: false,
    pushAfterCommit: false,
    skipTestVerify: false,
    maxConsecutiveFailures: 3,
    testCmd: undefined,
    ralphModel: undefined,
    ralphEffort: undefined,
    willieMaxIterations: 0,
    willieAuditPrompt: undefined,
    willieModel: undefined,
    willieEffort: undefined,
    lintCmd: undefined,
    logDir: join(homedir(), ".sfk", "logs"),
    progressDir: join(homedir(), ".sfk", "progress"),
    auditAfterComplete: false,
  };
}

/**
 * Load config with priority:
 * 1. CLI arguments (handled separately in args.ts)
 * 2. Environment variables
 * 3. Project config (.sfk/config)
 * 4. Global config (~/.config/sfk/config)
 *
 * Falls back to legacy .env format if new config doesn't exist.
 */
export function loadConfig(): Config {
  const config = defaultConfig();

  const hasNewGlobal = existsSync(GLOBAL_CONFIG_FILE);
  const hasNewProject = existsSync(join(process.cwd(), PROJECT_CONFIG_FILE));
  const hasLegacy = checkLegacyConfig();

  if (hasNewGlobal || hasNewProject) {
    // New INI format
    ensureGlobalConfig();

    try {
      const globalContent = readFileSync(GLOBAL_CONFIG_FILE, "utf-8");
      applyConfigToConfig(config, parseConfigFile(globalContent));
    } catch (err) {
      throw new Error(
        `Failed to read global config from ${GLOBAL_CONFIG_FILE}: ${err}`,
      );
    }

    const projectPath = join(process.cwd(), PROJECT_CONFIG_FILE);
    if (existsSync(projectPath)) {
      try {
        const projectContent = readFileSync(projectPath, "utf-8");
        applyConfigToConfig(config, parseConfigFile(projectContent));
      } catch (err) {
        throw new Error(
          `Failed to read project config from ${projectPath}: ${err}`,
        );
      }
    }
  } else if (hasLegacy) {
    // Fall back to legacy .env format
    if (existsSync(LEGACY_GLOBAL_FILE)) {
      try {
        const content = readFileSync(LEGACY_GLOBAL_FILE, "utf-8");
        applyEnvToConfig(config, parseEnvFile(content));
      } catch (err) {
        throw new Error(
          `Failed to read legacy global config from ${LEGACY_GLOBAL_FILE}: ${err}`,
        );
      }
    }
    const legacyProjectPath = join(process.cwd(), LEGACY_PROJECT_FILE);
    if (existsSync(legacyProjectPath)) {
      try {
        const content = readFileSync(legacyProjectPath, "utf-8");
        applyEnvToConfig(config, parseEnvFile(content));
      } catch (err) {
        throw new Error(
          `Failed to read legacy project config from ${legacyProjectPath}: ${err}`,
        );
      }
    }
  } else {
    // No config at all — create new global config
    ensureGlobalConfig();
    try {
      const globalContent = readFileSync(GLOBAL_CONFIG_FILE, "utf-8");
      applyConfigToConfig(config, parseConfigFile(globalContent));
    } catch (err) {
      throw new Error(
        `Failed to read newly created global config from ${GLOBAL_CONFIG_FILE}: ${err}`,
      );
    }
  }

  // Environment variables override everything (use legacy env var names for compat)
  const processEnv: Record<string, string> = {};
  if (process.env.ENGINE) processEnv.ENGINE = process.env.ENGINE;
  if (process.env.MAX_ITERATIONS)
    processEnv.MAX_ITERATIONS = process.env.MAX_ITERATIONS;
  if (process.env.SLEEP_SECONDS)
    processEnv.SLEEP_SECONDS = process.env.SLEEP_SECONDS;
  if (process.env.SKIP_COMMIT) processEnv.SKIP_COMMIT = process.env.SKIP_COMMIT;
  if (process.env.PUSH_AFTER_COMMIT)
    processEnv.PUSH_AFTER_COMMIT = process.env.PUSH_AFTER_COMMIT;
  if (process.env.CLAUDE_MODEL)
    processEnv.CLAUDE_MODEL = process.env.CLAUDE_MODEL;
  if (process.env.CODEX_MODEL) processEnv.CODEX_MODEL = process.env.CODEX_MODEL;
  if (process.env.OC_PRIME_MODEL)
    processEnv.OC_PRIME_MODEL = process.env.OC_PRIME_MODEL;
  if (process.env.OC_FALL_MODEL)
    processEnv.OC_FALL_MODEL = process.env.OC_FALL_MODEL;
  if (process.env.SOFT_LIMIT_RETRIES)
    processEnv.SOFT_LIMIT_RETRIES = process.env.SOFT_LIMIT_RETRIES;
  if (process.env.SOFT_LIMIT_WAIT)
    processEnv.SOFT_LIMIT_WAIT = process.env.SOFT_LIMIT_WAIT;
  if (process.env.TEST_CMD) processEnv.TEST_CMD = process.env.TEST_CMD;
  if (process.env.SKIP_TEST_VERIFY)
    processEnv.SKIP_TEST_VERIFY = process.env.SKIP_TEST_VERIFY;
  if (process.env.MAX_CONSECUTIVE_FAILURES)
    processEnv.MAX_CONSECUTIVE_FAILURES = process.env.MAX_CONSECUTIVE_FAILURES;
  if (process.env.RALPH_LOG_DIR)
    processEnv.RALPH_LOG_DIR = process.env.RALPH_LOG_DIR;
  if (process.env.RALPH_PROGRESS_DIR)
    processEnv.RALPH_PROGRESS_DIR = process.env.RALPH_PROGRESS_DIR;

  applyEnvToConfig(config, processEnv);

  if (!config.logDir) {
    config.logDir = join(homedir(), ".sfk", "logs");
  }
  if (!config.progressDir) {
    config.progressDir = join(homedir(), ".sfk", "progress");
  }

  return config;
}

/**
 * Get the current model based on engine type
 */
export function getCurrentModel(config: Config): string {
  return getEngineDefaultModel(config);
}

/**
 * Get the effective model for ralph (per-agent override or global default)
 */
export function getRalphModel(config: Config): string {
  return getEffectiveAgentModel(config, "ralph");
}

/**
 * Get the effective effort level for ralph
 */
export function getRalphEffort(config: Config): EffortLevel {
  return getEffectiveAgentEffort(config, "ralph");
}

/**
 * Get the effective model for willie (defaults to engine's primary model)
 */
export function getWillieModel(config: Config): string {
  return getEffectiveAgentModel(config, "willie");
}

/**
 * Get the effective effort level for willie
 */
export function getWillieEffort(config: Config): EffortLevel {
  return getEffectiveAgentEffort(config, "willie");
}

type AgentName = "ralph" | "willie";

function getEngineDefaultModel(config: Config): string {
  if (config.engine === "claude") return config.claudeModel;
  if (config.engine === "codex") return config.codexModel ?? "default";
  return config.ocPrimeModel;
}

function getEffectiveAgentModel(config: Config, agent: AgentName): string {
  if (agent === "willie" && config.willieModel) {
    return config.willieModel;
  }

  if (agent === "ralph" && config.engine === "claude") {
    return config.ralphModel ?? config.claudeModel;
  }

  return getEngineDefaultModel(config);
}

function getEffectiveAgentEffort(
  config: Config,
  agent: AgentName,
): EffortLevel {
  const override = agent === "ralph" ? config.ralphEffort : config.willieEffort;
  return override ?? config.claudeEffort;
}

export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG_FILE;
}

export function getProjectConfigPath(): string {
  return PROJECT_CONFIG_FILE;
}
