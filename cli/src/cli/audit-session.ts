import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Config } from "../config/loader.js";
import {
  getWillieEffort,
  getWillieModel,
  SFK_AUDIT_PROMPT_FILE,
} from "../config/loader.js";
import { type Engine, generateFixPrompt } from "../engines/base.js";
import { detectLintCommand, detectTestCommand } from "../tasks/verification.js";
import { initLogger } from "../ui/logger.js";
import { AUDIT_PROMPT_FILE, ensureAuditDirectories } from "./audit-paths.js";
import { initializeWillieEngine } from "./engine-factory.js";
import { getRunLogFile } from "./run-log.js";

export interface ResolvedPrompt {
  text: string;
  source: string;
}

export interface AuditSessionOptions {
  auditPromptPath?: string;
  lintCmd?: string;
  verbose?: boolean;
}

export interface AuditSession {
  projectName: string;
  logFile: string;
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

  if (existsSync(SFK_AUDIT_PROMPT_FILE)) {
    return {
      text: readFileSync(SFK_AUDIT_PROMPT_FILE, "utf-8"),
      source: SFK_AUDIT_PROMPT_FILE,
    };
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
  const logFile = getRunLogFile(config.logDir, projectName, "willie");
  initLogger({ logFile, verbose: options.verbose });

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
    logFile,
    model,
    effort,
    engine,
    auditPrompt: resolvedPrompt.text,
    auditPromptSource: resolvedPrompt.source,
    lintCmd,
    testCmd,
    fixPrompt: generateFixPrompt({
      testCmd,
      lintCmd,
      pushAfterFix: config.williePushAfterFix,
    }),
  };
}
