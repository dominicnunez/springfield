import type { Config } from "../config/loader.js";
import type { AuditCliOptions } from "./args.js";

/**
 * Resolve audit config from explicit config + flags.
 * Audit model is selected by engine model keys and --model override only.
 */
export function resolveAuditConfig(
  baseConfig: Config,
  auditOptions: AuditCliOptions,
): Config {
  const resolved = { ...baseConfig };

  if (auditOptions.engine) {
    resolved.engine = auditOptions.engine;
  }

  if (auditOptions.model !== undefined) {
    if (resolved.engine === "claude") {
      resolved.claudeModel = auditOptions.model;
    } else if (resolved.engine === "codex") {
      resolved.codexModel = auditOptions.model;
    } else {
      resolved.ocPrimeModel = auditOptions.model;
    }
  }

  return resolved;
}
