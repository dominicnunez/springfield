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
import { OpenCodeEngine } from "../engines/opencode.js";

const ENGINE_INSTALL_NAMES: Record<string, string> = {
  claude: "Claude CLI",
  codex: "Codex CLI",
  opencode: "OpenCode CLI",
};

export function getEngineInstallName(engineName: string): string {
  return ENGINE_INSTALL_NAMES[engineName] ?? `${engineName} CLI`;
}

export function createRalphEngine(config: Config): Engine {
  if (config.engine === "claude") {
    return new ClaudeEngine(getCurrentModel(config), getRalphEffort(config));
  }

  if (config.engine === "codex") {
    return new CodexEngine(config.codexModel);
  }

  return new OpenCodeEngine(config.ocPrimeModel, config.ocFallModel);
}

export function createWillieEngine(config: Config): Engine {
  const model = getWillieModel(config);

  if (config.engine === "opencode") {
    return new OpenCodeEngine(model, config.ocFallModel);
  }

  if (config.engine === "codex") {
    return new CodexEngine(model === "default" ? undefined : model);
  }

  return new ClaudeEngine(model, getWillieEffort(config));
}
