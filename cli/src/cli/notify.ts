import { spawnSync } from "node:child_process";
import { commandExists } from "../engines/process.js";
import { logDebug } from "../ui/logger.js";

export function notify(message: string): void {
  try {
    if (commandExists("openclaw")) {
      spawnSync("openclaw", ["cron", "wake", message], {
        encoding: "utf-8",
        stdio: "ignore",
      });
    }
  } catch (err) {
    logDebug(`Notification failed: ${err}`);
  }
}
