import type { Config } from "../config/loader.js";
import {
  getCurrentModel,
  getRalphEffort,
  getWillieEffort,
  getWillieModel,
} from "../config/loader.js";
import type { Engine } from "../engines/base.js";
import { ClaudeEngine } from "../engines/claude.js";
import { CodexEngine } from "../engines/codex.js";
import { InvalidEffortLevelError, assertEffortSupported } from "../engines/effort.js";
import { OpenCodeEngine } from "../engines/opencode.js";
import { logError } from "../ui/logger.js";

const ENGINE_INSTALL_NAMES: Record<string, string> = {
  claude: "Claude CLI",
  codex: "Codex CLI",
  opencode: "OpenCode CLI",
};

export function getEngineInstallName(engineName: string): string {
  return ENGINE_INSTALL_NAMES[engineName] ?? `${engineName} CLI`;
}

export function createRalphEngine(config: Config): Engine {
  const effort = getRalphEffort(config);
  assertEffortSupported(config.engine, effort);

  if (config.engine === "claude") {
    return new ClaudeEngine(getCurrentModel(config), effort);
  }

  if (config.engine === "codex") {
    return new CodexEngine(config.codexModel, effort);
  }

  return new OpenCodeEngine(config.ocPrimeModel, config.ocFallModel, effort);
}

export function createWillieEngine(config: Config): Engine {
  const model = getWillieModel(config);
  const effort = getWillieEffort(config);
  assertEffortSupported(config.engine, effort);

  if (config.engine === "opencode") {
    return new OpenCodeEngine(model, config.ocFallModel, effort);
  }

  if (config.engine === "codex") {
    return new CodexEngine(model === "default" ? undefined : model, effort);
  }

  return new ClaudeEngine(model, effort);
}

export function initializeRalphEngine(
  config: Config,
  buildUnavailableMessage: (engineName: string, cliName: string) => string,
  engineOverride?: Engine,
): Engine | null {
  let engine: Engine;
  try {
    engine = engineOverride ?? createRalphEngine(config);
  } catch (error) {
    if (error instanceof InvalidEffortLevelError) {
      logError(error.message);
      return null;
    }
    throw error;
  }

  if (!engine.isAvailable()) {
    const cliName = getEngineInstallName(engine.name);
    logError(buildUnavailableMessage(engine.name, cliName));
    return null;
  }

  return engine;
}

export function initializeWillieEngine(
  config: Config,
  buildUnavailableMessage: (engineName: string, cliName: string) => string,
  engineOverride?: Engine,
): Engine | null {
  let engine: Engine;
  try {
    engine = engineOverride ?? createWillieEngine(config);
  } catch (error) {
    if (error instanceof InvalidEffortLevelError) {
      logError(error.message);
      return null;
    }
    throw error;
  }

  if (!engine.isAvailable()) {
    const cliName = getEngineInstallName(engine.name);
    logError(buildUnavailableMessage(engine.name, cliName));
    return null;
  }

  return engine;
}
