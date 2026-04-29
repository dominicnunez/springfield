import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logWarning } from "../ui/logger.js";

export type EngineType = "opencode" | "claude" | "codex";
export type EffortLevel = "high" | "medium" | "low" | "xhigh";
export type ConfigRequirementMode = "run" | "audit" | "prune";

const DEFAULT_RALPH_MAX_ITERATIONS = 10;
const DEFAULT_RALPH_SLEEP_SECONDS = 2;
const DEFAULT_RALPH_MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_WILLIE_MAX_ITERATIONS = 0;

export const SFK_HOME_DIR = join(homedir(), ".sfk");
export const SFK_CONFIG_FILE = join(SFK_HOME_DIR, "config");
export const SFK_LOG_DIR = join(SFK_HOME_DIR, "logs");
export const SFK_PROGRESS_DIR = join(SFK_HOME_DIR, "progress");
export const SFK_AUDIT_PROMPT_FILE = join(SFK_HOME_DIR, "audit-prompt.md");

export interface Config {
  // Engine
  engine: EngineType;

  // Models
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
  williePushAfterFix: boolean;
  lintCmd: string | undefined;

  // Logging
  logDir: string;
  progressDir: string;

  // Chaining
  auditAfterComplete: boolean;
}

const EXAMPLE_CONFIG_CONTENT = `# SFK Configuration
# Location: ~/.sfk/config
# Uncomment and set every required value before running sfk.

[engine]
# type = opencode

[models]
# claude = sonnet
# codex = gpt-5-codex
# opencode-primary = big-pickle
# opencode-fallback =
# effort = high               # low|medium|high|xhigh
# Claude supports only low|medium|high and errors on xhigh

[rate-limits]
# soft-retries = 3
# soft-wait = 30

[ralph]
# max-iterations = 10
# sleep-seconds = 2
# skip-commit = false
# push-after-commit = false
# skip-test-verify = false
# max-consecutive-failures = 3
# audit-after-complete = false
# test-cmd =
# model = sonnet
# effort = high               # overrides the global effort for Ralph

[willie]
# max-iterations = 0
# push-after-fix = false
# audit-prompt = audit/prompt.md
# lint-cmd =
# model = opus
# effort = high               # overrides the global effort for Willie
`;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

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

function parseInteger(value: string): number | undefined {
  if (!/^-?\d+$/.test(value.trim())) return undefined;
  return Number.parseInt(value, 10);
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

function assignInteger(
  parsed: Record<string, string>,
  key: string,
  assign: (value: number) => void,
  issues: string[],
  options: { min?: number } = {},
): void {
  const raw = parsed[key];
  if (raw === undefined) return;

  const value = parseInteger(raw);
  if (
    value === undefined ||
    (options.min !== undefined && value < options.min)
  ) {
    issues.push(
      `${key} must be an integer${options.min !== undefined ? ` >= ${options.min}` : ""}.`,
    );
    return;
  }

  assign(value);
}

function assignBoolean(
  parsed: Record<string, string>,
  key: string,
  assign: (value: boolean) => void,
  issues: string[],
): void {
  const raw = parsed[key];
  if (raw === undefined) return;

  const value = parseBool(raw);
  if (value === undefined) {
    issues.push(`${key} must be true or false.`);
    return;
  }

  assign(value);
}

function assignEffort(
  parsed: Record<string, string>,
  key: string,
  assign: (value: EffortLevel) => void,
  issues: string[],
): void {
  const raw = parsed[key];
  if (raw === undefined) return;

  const value = parseEffort(raw);
  if (!value) {
    issues.push(`${key} must be one of: low, medium, high, xhigh.`);
    return;
  }

  assign(value);
}

/**
 * Apply parsed INI config values to a config object.
 * Returns validation issues for provided values that are malformed.
 */
export function applyConfigToConfig(
  config: Partial<Config>,
  parsed: Record<string, string>,
): string[] {
  const issues: string[] = [];

  // [engine]
  const engineType = parsed["engine.type"];
  if (
    engineType === "claude" ||
    engineType === "opencode" ||
    engineType === "codex"
  ) {
    config.engine = engineType;
  } else if (engineType !== undefined) {
    issues.push("engine.type must be one of: opencode, claude, codex.");
  }

  // [models]
  if (parsed["models.claude"]?.trim())
    config.claudeModel = parsed["models.claude"];
  assignEffort(
    parsed,
    "models.effort",
    (value) => {
      config.claudeEffort = value;
    },
    issues,
  );
  if (parsed["models.codex"]?.trim())
    config.codexModel = parsed["models.codex"];
  if (parsed["models.opencode-primary"]?.trim())
    config.ocPrimeModel = parsed["models.opencode-primary"];
  if (parsed["models.opencode-fallback"]?.trim())
    config.ocFallModel = parsed["models.opencode-fallback"];

  // [rate-limits]
  assignInteger(
    parsed,
    "rate-limits.soft-retries",
    (value) => {
      config.softLimitRetries = value;
    },
    issues,
    { min: 0 },
  );
  assignInteger(
    parsed,
    "rate-limits.soft-wait",
    (value) => {
      config.softLimitWait = value;
    },
    issues,
    { min: 0 },
  );

  // [ralph]
  assignInteger(
    parsed,
    "ralph.max-iterations",
    (value) => {
      config.maxIterations = value;
    },
    issues,
    { min: -1 },
  );
  assignInteger(
    parsed,
    "ralph.sleep-seconds",
    (value) => {
      config.sleepSeconds = value;
    },
    issues,
    { min: 0 },
  );
  assignBoolean(
    parsed,
    "ralph.skip-commit",
    (value) => {
      config.skipCommit = value;
    },
    issues,
  );
  assignBoolean(
    parsed,
    "ralph.push-after-commit",
    (value) => {
      config.pushAfterCommit = value;
    },
    issues,
  );
  assignBoolean(
    parsed,
    "ralph.skip-test-verify",
    (value) => {
      config.skipTestVerify = value;
    },
    issues,
  );
  assignInteger(
    parsed,
    "ralph.max-consecutive-failures",
    (value) => {
      config.maxConsecutiveFailures = value;
    },
    issues,
    { min: 1 },
  );
  if (parsed["ralph.test-cmd"]?.trim())
    config.testCmd = parsed["ralph.test-cmd"];
  if (parsed["ralph.model"]?.trim()) config.ralphModel = parsed["ralph.model"];
  assignEffort(
    parsed,
    "ralph.effort",
    (value) => {
      config.ralphEffort = value;
    },
    issues,
  );
  assignBoolean(
    parsed,
    "ralph.audit-after-complete",
    (value) => {
      config.auditAfterComplete = value;
    },
    issues,
  );

  // [willie]
  assignInteger(
    parsed,
    "willie.max-iterations",
    (value) => {
      config.willieMaxIterations = value;
    },
    issues,
    { min: 0 },
  );
  assignBoolean(
    parsed,
    "willie.push-after-fix",
    (value) => {
      config.williePushAfterFix = value;
    },
    issues,
  );
  if (parsed["willie.audit-prompt"]?.trim())
    config.willieAuditPrompt = parsed["willie.audit-prompt"];
  if (parsed["willie.lint-cmd"]?.trim())
    config.lintCmd = parsed["willie.lint-cmd"];
  if (parsed["willie.model"]?.trim())
    config.willieModel = parsed["willie.model"];
  assignEffort(
    parsed,
    "willie.effort",
    (value) => {
      config.willieEffort = value;
    },
    issues,
  );

  if (parsed["logging.log-dir"] !== undefined) {
    issues.push(
      `logging.log-dir is not supported; logs always use ${SFK_LOG_DIR}.`,
    );
  }
  if (parsed["logging.progress-dir"] !== undefined) {
    issues.push(
      `logging.progress-dir is not supported; progress always uses ${SFK_PROGRESS_DIR}.`,
    );
  }

  return issues;
}

/**
 * Ensure global config exists with every value commented out.
 */
function ensureGlobalConfig(): void {
  if (!existsSync(SFK_CONFIG_FILE)) {
    if (!existsSync(SFK_HOME_DIR)) {
      mkdirSync(SFK_HOME_DIR, { recursive: true });
    }
    writeFileSync(SFK_CONFIG_FILE, EXAMPLE_CONFIG_CONTENT);
  }
}

function requireConfigValue<T>(
  key: string,
  value: T | undefined,
  issues: string[],
): T {
  if (
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    issues.push(`${key} is required.`);
  }

  return value as T;
}

function buildConfigErrorMessage(issues: string[]): string {
  return [
    "SFK needs a complete config before it can run.",
    "",
    `Config file: ${SFK_CONFIG_FILE}`,
    "",
    "Open that file, uncomment the settings you want, and fill in every required value.",
    "The generated file and config.example show the available keys.",
    "",
    "Missing or invalid settings:",
    ...issues.map((issue) => `- ${issue}`),
  ].join("\n");
}

export function completeConfig(
  config: Partial<Config>,
  issues: string[],
  mode: ConfigRequirementMode = "run",
): Config {
  const engine = requireConfigValue("engine.type", config.engine, issues);
  const claudeEffort = requireConfigValue(
    "models.effort",
    config.claudeEffort,
    issues,
  );
  const claudeModel =
    engine === "claude"
      ? requireConfigValue("models.claude", config.claudeModel, issues)
      : (config.claudeModel ?? "");
  const codexModel =
    engine === "codex"
      ? requireConfigValue("models.codex", config.codexModel, issues)
      : config.codexModel;
  const ocPrimeModel =
    engine === "opencode"
      ? requireConfigValue(
          "models.opencode-primary",
          config.ocPrimeModel,
          issues,
        )
      : (config.ocPrimeModel ?? "");
  const softLimitRetries = requireConfigValue(
    "rate-limits.soft-retries",
    config.softLimitRetries,
    issues,
  );
  const softLimitWait = requireConfigValue(
    "rate-limits.soft-wait",
    config.softLimitWait,
    issues,
  );
  const maxIterations =
    mode === "run"
      ? requireConfigValue("ralph.max-iterations", config.maxIterations, issues)
      : (config.maxIterations ?? DEFAULT_RALPH_MAX_ITERATIONS);
  const sleepSeconds =
    mode === "run"
      ? requireConfigValue("ralph.sleep-seconds", config.sleepSeconds, issues)
      : (config.sleepSeconds ?? DEFAULT_RALPH_SLEEP_SECONDS);
  const skipCommit =
    mode === "run"
      ? requireConfigValue("ralph.skip-commit", config.skipCommit, issues)
      : (config.skipCommit ?? false);
  const pushAfterCommit =
    mode === "run"
      ? requireConfigValue(
          "ralph.push-after-commit",
          config.pushAfterCommit,
          issues,
        )
      : (config.pushAfterCommit ?? false);
  const skipTestVerify =
    mode === "run"
      ? requireConfigValue(
          "ralph.skip-test-verify",
          config.skipTestVerify,
          issues,
        )
      : (config.skipTestVerify ?? false);
  const maxConsecutiveFailures =
    mode === "run"
      ? requireConfigValue(
          "ralph.max-consecutive-failures",
          config.maxConsecutiveFailures,
          issues,
        )
      : (config.maxConsecutiveFailures ??
        DEFAULT_RALPH_MAX_CONSECUTIVE_FAILURES);
  const auditAfterComplete =
    mode === "run"
      ? requireConfigValue(
          "ralph.audit-after-complete",
          config.auditAfterComplete,
          issues,
        )
      : (config.auditAfterComplete ?? false);
  const willieMaxIterations =
    mode === "run" || mode === "audit"
      ? requireConfigValue(
          "willie.max-iterations",
          config.willieMaxIterations,
          issues,
        )
      : (config.willieMaxIterations ?? DEFAULT_WILLIE_MAX_ITERATIONS);
  const williePushAfterFix =
    mode === "run" || mode === "audit"
      ? requireConfigValue(
          "willie.push-after-fix",
          config.williePushAfterFix,
          issues,
        )
      : (config.williePushAfterFix ?? false);

  if (issues.length > 0) {
    throw new ConfigError(buildConfigErrorMessage(issues));
  }

  return {
    engine,
    claudeModel,
    claudeEffort,
    codexModel,
    ocPrimeModel,
    ocFallModel: config.ocFallModel,
    softLimitRetries,
    softLimitWait,
    maxIterations,
    sleepSeconds,
    skipCommit,
    pushAfterCommit,
    skipTestVerify,
    maxConsecutiveFailures,
    testCmd: config.testCmd,
    ralphModel: config.ralphModel,
    ralphEffort: config.ralphEffort,
    willieMaxIterations,
    willieAuditPrompt: config.willieAuditPrompt,
    willieModel: config.willieModel,
    willieEffort: config.willieEffort,
    williePushAfterFix,
    lintCmd: config.lintCmd,
    logDir: SFK_LOG_DIR,
    progressDir: SFK_PROGRESS_DIR,
    auditAfterComplete,
  };
}

/**
 * Load config from ~/.sfk/config. CLI arguments are merged separately.
 */
export function loadConfig(mode: ConfigRequirementMode = "run"): Config {
  ensureGlobalConfig();

  try {
    const content = readFileSync(SFK_CONFIG_FILE, "utf-8");
    const config: Partial<Config> = {
      logDir: SFK_LOG_DIR,
      progressDir: SFK_PROGRESS_DIR,
    };
    const issues = applyConfigToConfig(config, parseConfigFile(content));

    return completeConfig(config, issues, mode);
  } catch (error) {
    if (error instanceof ConfigError) throw error;

    throw new ConfigError(
      `SFK could not read its config at ${SFK_CONFIG_FILE}.\n\n${error}`,
    );
  }
}

/**
 * Get the current model based on engine type
 */
export function getCurrentModel(config: Config): string {
  return getEngineModel(config);
}

/**
 * Get the effective model for ralph (per-agent override or configured engine model)
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
 * Get the effective model for willie.
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

function getEngineModel(config: Config): string {
  if (config.engine === "claude") {
    if (!config.claudeModel.trim()) {
      throw new ConfigError(
        "models.claude is required when engine.type is claude.",
      );
    }
    return config.claudeModel;
  }
  if (config.engine === "codex") {
    if (!config.codexModel) {
      throw new ConfigError(
        "models.codex is required when engine.type is codex.",
      );
    }
    return config.codexModel;
  }
  if (!config.ocPrimeModel.trim()) {
    throw new ConfigError(
      "models.opencode-primary is required when engine.type is opencode.",
    );
  }
  return config.ocPrimeModel;
}

function getEffectiveAgentModel(config: Config, agent: AgentName): string {
  if (agent === "willie" && config.willieModel) {
    return config.willieModel;
  }

  if (agent === "ralph" && config.engine === "claude") {
    return config.ralphModel ?? config.claudeModel;
  }

  return getEngineModel(config);
}

function getEffectiveAgentEffort(
  config: Config,
  agent: AgentName,
): EffortLevel {
  const override = agent === "ralph" ? config.ralphEffort : config.willieEffort;
  return override ?? config.claudeEffort;
}

export function getGlobalConfigPath(): string {
  return SFK_CONFIG_FILE;
}
