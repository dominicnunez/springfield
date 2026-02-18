import { spawnSync } from "node:child_process";
import type { EffortLevel } from "../config/loader.js";
import type { Engine, EngineResult } from "./base.js";

export class ClaudeEngine implements Engine {
  name = "claude";
  model: string;
  effort: EffortLevel;

  constructor(model: string = "opus", effort: EffortLevel = "high") {
    this.model = model;
    this.effort = effort;
  }

  isAvailable(): boolean {
    const result = spawnSync("which", ["claude"], { encoding: "utf-8" });
    return result.status === 0;
  }

  async run(prompt: string): Promise<EngineResult> {
    const args = [
      "--model",
      this.model,
      "--effort",
      this.effort,
      "--dangerously-skip-permissions",
      "-p",
      prompt,
    ];

    const result = spawnSync("claude", args, {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["inherit", "pipe", "pipe"],
      maxBuffer: 50 * 1024 * 1024,
    });

    const output = (result.stdout || "") + (result.stderr || "");

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    return {
      success: result.status === 0,
      output,
      exitCode: result.status ?? 1,
      rateLimited: false,
    };
  }

  switchToFallback(): boolean {
    return false;
  }
}
