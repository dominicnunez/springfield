import { logWarning } from "../ui/logger.js";
import type { Engine, EngineResult } from "./base.js";
import { commandExists, spawnLineProcess } from "./process.js";

interface CodexItem {
  type?: string;
  text?: string;
}

interface CodexEvent {
  type: string;
  message?: string;
  item?: CodexItem;
  error?: {
    message?: string;
  };
}

export class CodexEngine implements Engine {
  name = "codex";
  model: string;
  private selectedModel: string | undefined;

  constructor(model?: string) {
    this.selectedModel = model?.trim() ? model : undefined;
    this.model = this.selectedModel ?? "default";
  }

  isAvailable(): boolean {
    return commandExists("codex");
  }

  async run(prompt: string): Promise<EngineResult> {
    const args = [
      "exec",
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      "--skip-git-repo-check",
    ];

    if (this.selectedModel) {
      args.push("--model", this.selectedModel);
    }
    args.push(prompt);

    return new Promise<EngineResult>((resolve) => {
      const processResult = spawnLineProcess("codex", args, [
        "ignore",
        "pipe",
        "pipe",
      ]);

      if ("error" in processResult) {
        resolve({
          success: false,
          output: processResult.error,
          exitCode: 1,
        });
        return;
      }

      const { child, rl, killChild, installSafetyTimeout } = processResult;

      const outputLines: string[] = [];
      let stderr = "";
      let sawErrorEvent = false;

      rl.on("line", (line) => {
        if (!line.trim()) return;

        try {
          const event: CodexEvent = JSON.parse(line);

          if (
            event.type === "item.completed" &&
            event.item?.type === "agent_message" &&
            event.item.text
          ) {
            process.stdout.write(`${event.item.text}\n`);
            outputLines.push(event.item.text);
            return;
          }

          if (event.type === "error") {
            sawErrorEvent = true;
            const message =
              event.error?.message || event.message || "Codex error";
            outputLines.push(`[error] ${message}`);
          }
        } catch (err) {
          logWarning(
            `Failed to parse Codex JSON event: ${err}. Raw: ${line.slice(0, 100)}`,
          );
          process.stdout.write(`${line}\n`);
          outputLines.push(line);
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });

      child.on("close", (code) => {
        rl.close();

        const mergedOutput = outputLines.join("\n").trim();
        const success = !sawErrorEvent && code === 0;

        resolve({
          success,
          output: mergedOutput || stderr,
          exitCode: code ?? 1,
        });
      });

      installSafetyTimeout("Codex process");
    });
  }

  switchToFallback(): boolean {
    return false;
  }
}
