import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
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
    try {
      const { spawnSync } = require("node:child_process");
      const result = spawnSync("which", ["claude"], { encoding: "utf-8" });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  async run(prompt: string): Promise<EngineResult> {
    const args = [
      "--model",
      this.model,
      "--dangerously-skip-permissions",
      "--no-session-persistence",
      "--output-format",
      "stream-json",
      "--verbose",
      "-p",
      prompt,
    ];

    return new Promise<EngineResult>((resolve) => {
      const child = spawn("claude", args, {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let resultEvent: any = null;
      let lastAssistantText = "";
      let killed = false;

      const killChild = () => {
        if (!killed) {
          killed = true;
          child.kill("SIGTERM");
          // Force kill after 5s if SIGTERM doesn't work
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {}
          }, 5000);
        }
      };

      // Parse streaming JSON lines from stdout
      const rl = createInterface({ input: child.stdout! });

      rl.on("line", (line) => {
        if (!line.trim()) return;

        try {
          const event = JSON.parse(line);

          // Collect text deltas for output
          if (
            event.type === "stream_event" &&
            event.event?.type === "content_block_delta" &&
            event.event?.delta?.type === "text_delta"
          ) {
            const text = event.event.delta.text;
            process.stdout.write(text);
            output += text;
          }

          // Capture full assistant messages
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text") {
                lastAssistantText = block.text;
              }
            }
          }

          // Detect result event — Claude is done, kill process
          if (event.type === "result") {
            resultEvent = event;
            if (event.result) {
              output = event.result;
            }
            // Claude CLI hangs after result event (known bug #25629)
            // Kill it ourselves since it won't exit cleanly
            killChild();
          }
        } catch {
          // Non-JSON line, append to output
          output += line + "\n";
          process.stdout.write(line + "\n");
        }
      });

      // Capture stderr
      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });

      child.on("close", (code) => {
        rl.close();

        // If we got a result event, use its status regardless of exit code
        if (resultEvent) {
          resolve({
            success: !resultEvent.is_error,
            output: output || lastAssistantText,
            exitCode: 0,
            rateLimited: false,
          });
          return;
        }

        // No result event — check for rate limiting in stderr/output
        const combined = output + stderr;
        const rateLimited =
          combined.includes("rate limit") ||
          combined.includes("429") ||
          combined.includes("overloaded");

        resolve({
          success: code === 0,
          output: output || stderr,
          exitCode: code ?? 1,
          rateLimited,
        });
      });

      // Safety timeout: 45 minutes max per step
      const safetyTimeout = setTimeout(() => {
        if (!resultEvent) {
          process.stderr.write(
            "\n[sfk] Safety timeout reached (45 min), killing Claude process\n"
          );
          killChild();
        }
      }, 45 * 60 * 1000);

      child.on("close", () => {
        clearTimeout(safetyTimeout);
      });
    });
  }

  switchToFallback(): boolean {
    return false;
  }
}
