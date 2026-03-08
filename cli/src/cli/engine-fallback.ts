import pc from "picocolors";
import type { Engine } from "../engines/base.js";
import { logWarning } from "../ui/logger.js";

export function switchToFallbackWithNotice(engine: Engine): boolean {
  const currentModel = engine.model;

  if (!engine.switchToFallback?.()) {
    return false;
  }

  logWarning(
    `Rate limit on ${currentModel}, switching to fallback: ${engine.model}`,
  );
  console.log("");
  console.log("===========================================");
  console.log(`  Rate limit detected on ${currentModel}`);
  console.log(`  Switching to fallback: ${engine.model}`);
  console.log("===========================================");
  console.log("");

  return true;
}
