import type { Config, EngineType } from "../config/loader.js";

export interface EngineModelSelection {
  engine?: EngineType;
  model?: string;
}

export function applyEngineModelSelection(
  baseConfig: Config,
  selection: EngineModelSelection,
): Config {
  const resolved = { ...baseConfig };

  if (selection.engine) {
    resolved.engine = selection.engine;
  }

  if (selection.model === undefined) {
    return resolved;
  }

  if (resolved.engine === "claude") {
    resolved.claudeModel = selection.model;
  } else if (resolved.engine === "codex") {
    resolved.codexModel = selection.model;
  } else {
    resolved.ocPrimeModel = selection.model;
  }

  return resolved;
}
