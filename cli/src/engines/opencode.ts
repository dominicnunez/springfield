import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { DEFAULT_OC_PRIME_MODEL } from "../config/loader.js";
import { logWarning } from "../ui/logger.js";
import type { Engine, EngineResult } from "./base.js";

interface OpenCodeEvent {
  type: string;
  timestamp: number;
  sessionID: string;
  part?: {
    type: string;
    text?: string;
    reason?: string;
  };
  error?: {
    type?: string;
    code?: string;
    message?: string;
    name?: string;
    data?: {
      message?: string;
      responseBody?: string;
      isRetryable?: boolean;
    };
  };
}

export class OpenCodeEngine implements Engine {
  name = "opencode";
  model: string;

  private primaryModel: string;
  private fallbackModel: string | undefined;
  private usingFallback = false;

  constructor(model: string = DEFAULT_OC_PRIME_MODEL, fallbackModel?: string) {
    this.primaryModel = model;
    this.model = model;
    this.fallbackModel = fallbackModel;
  }

  isAvailable(): boolean {
    const { spawnSync } = require("node:child_process");
    const result = spawnSync("which", ["opencode"], { encoding: "utf-8" });
    return result.status === 0;
  }

  async run(prompt: string): Promise<EngineResult> {
    const args = ["run", "--format", "json", "--model", this.model, prompt];

    return new Promise<EngineResult>((resolve) => {
      const child = spawn("opencode", args, {
        cwd: process.cwd(),
        stdio: ["inherit", "pipe", "pipe"],
      });

      let output = "";
      let stderr = "";
      let killed = false;
      let completed = false;
      let rateLimited = false;
      let hardRateLimited = false;
      let softRateLimited = false;

      const killChild = () => {
        if (!killed) {
          killed = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {}
          }, 5000);
        }
      };

      if (!child.stdout) {
        resolve({
          success: false,
          output: "Failed to spawn opencode: no stdout",
          exitCode: 1,
          rateLimited: false,
        });
        return;
      }

      const rl = createInterface({ input: child.stdout });

      rl.on("line", (line) => {
        if (!line.trim()) return;

        try {
          const event: OpenCodeEvent = JSON.parse(line);

          if (event.type === "text" && event.part?.text) {
            process.stdout.write(event.part.text);
            output += event.part.text;
          }

          if (event.type === "error" && event.error) {
            const errorType = event.error.type?.toLowerCase() || "";
            const errorCode = event.error.code?.toLowerCase() || "";
            const errorMsg = (
              event.error.message ||
              event.error.data?.message ||
              ""
            ).toLowerCase();
            const responseBody = event.error.data?.responseBody || "";

            if (
              errorType === "too_many_requests" ||
              errorCode.includes("rate_limit")
            ) {
              rateLimited = true;
              if (
                responseBody.includes("FreeUsageLimitError") ||
                errorMsg.includes("insufficient") ||
                errorMsg.includes("quota") ||
                errorMsg.includes("billing")
              ) {
                hardRateLimited = true;
              } else {
                softRateLimited = true;
              }
            }

            const errMsg =
              event.error.data?.message ||
              event.error.message ||
              event.error.name ||
              "Unknown error";
            output += `[error] ${errMsg}\n`;
          }

          if (event.type === "step_finish" && event.part?.reason === "stop") {
            completed = true;
            killChild();
          }
        } catch (err) {
          logWarning(`Failed to parse OpenCode event: ${err}`);
          process.stdout.write(`${line}\n`);
          output += `${line}\n`;
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });

      child.on("close", (code) => {
        rl.close();

        if (!rateLimited && output + stderr) {
          const combined = (output + stderr).toLowerCase();
          if (
            combined.includes("rate limit") ||
            combined.includes("429") ||
            combined.includes("too many request")
          ) {
            rateLimited = true;
            softRateLimited = true;
          }
          if (
            combined.includes("insufficient") ||
            combined.includes("quota") ||
            combined.includes("billing")
          ) {
            hardRateLimited = true;
            softRateLimited = false;
          }
        }

        const success = completed || code === 0;

        resolve({
          success,
          output: output || stderr,
          exitCode: code ?? 1,
          rateLimited,
          hardRateLimited,
          softRateLimited,
        });
      });

      const safetyTimeout = setTimeout(
        () => {
          process.stderr.write(
            "\n[sfk] Safety timeout reached (45 min), killing OpenCode process\n",
          );
          killChild();
        },
        45 * 60 * 1000,
      );

      child.on("close", () => {
        clearTimeout(safetyTimeout);
      });
    });
  }

  switchToFallback(): boolean {
    if (this.fallbackModel && !this.usingFallback) {
      logWarning(
        `Rate limit on ${this.model}, switching to fallback: ${this.fallbackModel}`,
      );
      console.log("");
      console.log("===========================================");
      console.log(`  Rate limit detected on ${this.model}`);
      console.log(`  Switching to fallback: ${this.fallbackModel}`);
      console.log("===========================================");
      console.log("");

      this.model = this.fallbackModel;
      this.usingFallback = true;
      return true;
    }
    return false;
  }

  resetToPrimary(): void {
    this.model = this.primaryModel;
    this.usingFallback = false;
  }

  isUsingFallback(): boolean {
    return this.usingFallback;
  }
}
