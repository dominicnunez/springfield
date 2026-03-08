import type { Config } from "../config/loader.js";
import type { AuditCliOptions } from "./args.js";
import { applyEngineModelSelection } from "./model-overrides.js";

/**
 * Resolve audit config from explicit config + flags.
 * Audit model is selected by engine model keys and --model override only.
 */
export function resolveAuditConfig(
  baseConfig: Config,
  auditOptions: AuditCliOptions,
): Config {
  return applyEngineModelSelection(baseConfig, {
    engine: auditOptions.engine,
    model: auditOptions.model,
  });
}
