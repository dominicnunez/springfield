import { spawnSync } from "node:child_process";
import { logDebug } from "../ui/logger.js";

export function notify(message: string): void {
  try {
    const result = spawnSync("which", ["openclaw"], { encoding: "utf-8" });
    if (result.status === 0) {
      spawnSync("openclaw", ["cron", "wake", message], {
        encoding: "utf-8",
        stdio: "ignore",
      });
    }
  } catch (err) {
    logDebug(`Notification failed: ${err}`);
  }
}
