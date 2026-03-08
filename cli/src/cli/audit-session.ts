import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Config } from "../config/loader.js";
import { getWillieEffort, getWillieModel } from "../config/loader.js";
import { type Engine, generateFixPrompt } from "../engines/base.js";
import { detectLintCommand, detectTestCommand } from "../tasks/verification.js";
import { AUDIT_PROMPT_FILE, ensureAuditDirectories } from "./audit-paths.js";
import { initializeWillieEngine } from "./engine-factory.js";

export interface ResolvedPrompt {
  text: string;
  source: string;
}

export interface AuditSessionOptions {
  auditPromptPath?: string;
  lintCmd?: string;
}

export interface AuditSession {
  projectName: string;
  logDir: string;
  model: string;
  effort: string;
  engine: Engine;
  auditPrompt: string;
  auditPromptSource: string;
  lintCmd: string | undefined;
  testCmd: string | undefined;
  fixPrompt: string;
}

export function resolveAuditPrompt(
  auditPromptPath: string | undefined,
  fallbackPrompt: string,
): ResolvedPrompt {
  if (auditPromptPath && existsSync(auditPromptPath)) {
    return {
      text: readFileSync(auditPromptPath, "utf-8"),
      source: auditPromptPath,
    };
  }

  if (existsSync(AUDIT_PROMPT_FILE)) {
    return {
      text: readFileSync(AUDIT_PROMPT_FILE, "utf-8"),
      source: AUDIT_PROMPT_FILE,
    };
  }

  const globalPrompt = join(homedir(), ".config", "sfk", "audit-prompt.md");
  if (existsSync(globalPrompt)) {
    return { text: readFileSync(globalPrompt, "utf-8"), source: globalPrompt };
  }

  return { text: fallbackPrompt, source: "built-in default" };
}

export function initializeAuditSession(
  config: Config,
  options: AuditSessionOptions,
  fallbackPrompt: string,
  engineOverride?: Engine,
): AuditSession | null {
  const projectName = basename(process.cwd());
  const logDir = join(config.logDir, `willie-${projectName}`);

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const model = getWillieModel(config);
  const effort = getWillieEffort(config);
  const engine = initializeWillieEngine(
    config,
    (engineName, cliName) =>
      `'${engineName}' command not found. Willie requires ${cliName}.`,
    engineOverride,
  );
  if (!engine) {
    return null;
  }

  const resolvedPrompt = resolveAuditPrompt(
    options.auditPromptPath,
    fallbackPrompt,
  );
  const lintCmd = options.lintCmd ?? config.lintCmd ?? detectLintCommand();
  const testCmd = config.testCmd ?? detectTestCommand();

  ensureAuditDirectories();

  return {
    projectName,
    logDir,
    model,
    effort,
    engine,
    auditPrompt: resolvedPrompt.text,
    auditPromptSource: resolvedPrompt.source,
    lintCmd,
    testCmd,
    fixPrompt: generateFixPrompt({ testCmd, lintCmd }),
  };
}
