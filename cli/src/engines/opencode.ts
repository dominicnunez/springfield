import { DEFAULT_OC_PRIME_MODEL } from "../config/loader.js";
import { logWarning } from "../ui/logger.js";
import type { Engine, EngineResult } from "./base.js";
import { commandExists, spawnLineProcess } from "./process.js";

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
    return commandExists("opencode");
  }

  async run(prompt: string): Promise<EngineResult> {
    const args = ["run", "--format", "json", "--model", this.model, prompt];

    return new Promise<EngineResult>((resolve) => {
      const processResult = spawnLineProcess("opencode", args, [
        "inherit",
        "pipe",
        "pipe",
      ]);

      if ("error" in processResult) {
        resolve({
          success: false,
          output: processResult.error,
          exitCode: 1,
          rateLimited: false,
        });
        return;
      }

      const { child, rl, killChild, installSafetyTimeout } = processResult;

      let output = "";
      let stderr = "";
      let completed = false;
      let rateLimited = false;
      let hardRateLimited = false;
      let softRateLimited = false;

      rl.on("line", (line) => {
        if (!line.trim()) return;

        try {
          const event: OpenCodeEvent = JSON.parse(line);

          if (event.type === "text" && event.part?.text) {
            process.stdout.write(event.part.text);
            output += event.part.text;
          } else if (event.type === "text") {
            process.stdout.write(`${line}\n`);
            output += `${line}\n`;
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
          logWarning(
            `Failed to parse OpenCode event: ${err}. Raw: ${line.slice(0, 100)}`,
          );
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

      installSafetyTimeout("OpenCode process");
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
