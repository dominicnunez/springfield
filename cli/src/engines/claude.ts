import type { EffortLevel } from "../config/loader.js";
import type { Engine, EngineResult } from "./base.js";
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
      const processResult = spawnLineProcess("claude", args, [
        "ignore",
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
      // biome-ignore lint/suspicious/noExplicitAny: Claude stream events have varying shapes
      let resultEvent: any = null;
      let lastAssistantText = "";

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
          output += `${line}\n`;
          process.stdout.write(`${line}\n`);
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

      installSafetyTimeout("Claude process", () => !resultEvent);
    });
  }

  switchToFallback(): boolean {
    return false;
  }
}
