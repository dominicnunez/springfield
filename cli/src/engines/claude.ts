import type { EffortLevel } from "../config/loader.js";
import type { Engine, EngineResult } from "./base.js";
import { getEngineEffortConfig } from "./effort.js";
import { commandExists, spawnLineProcess } from "./process.js";

export class ClaudeEngine implements Engine {
  name = "claude";
  model: string;
  effort: EffortLevel;

  constructor(model: string = "opus", effort: EffortLevel = "high") {
    this.model = model;
    this.effort = effort;
  }

  isAvailable(): boolean {
    return commandExists("claude");
  }

  async run(prompt: string): Promise<EngineResult> {
    const effortConfig = getEngineEffortConfig("claude", this.effort);
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
      const processResult = spawnLineProcess(
        "claude",
        args,
        ["ignore", "pipe", "pipe"],
        { ...process.env, ...effortConfig.env },
      );

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
      // biome-ignore lint/suspicious/noExplicitAny: Claude stream events have varying shapes
      let resultEvent: any = null;
      let lastAssistantText = "";

      rl.on("line", (line) => {
        if (!line.trim()) return;

        try {
          const event = JSON.parse(line);

          if (
            event.type === "stream_event" &&
            event.event?.type === "content_block_delta" &&
            event.event?.delta?.type === "text_delta"
          ) {
            const text = event.event.delta.text;
            process.stdout.write(text);
            output += text;
          }

          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text") {
                lastAssistantText = block.text;
              }
            }
          }

          if (event.type === "result") {
            resultEvent = event;
            if (event.result) {
              output = event.result;
            }
            killChild();
          }
        } catch {
          output += `${line}\n`;
          process.stdout.write(`${line}\n`);
        }
      });

      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });

      child.on("close", (code) => {
        rl.close();

        if (resultEvent) {
          resolve({
            success: !resultEvent.is_error,
            output: output || lastAssistantText,
            exitCode: 0,
            rateLimited: false,
          });
          return;
        }

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

      installSafetyTimeout("Claude process", () => !resultEvent);
    });
  }

  switchToFallback(): boolean {
    return false;
  }
}
