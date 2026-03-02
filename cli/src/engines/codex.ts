import * as childProcess from "node:child_process";
import { createInterface } from "node:readline";
import { logWarning } from "../ui/logger.js";
import type { Engine, EngineResult } from "./base.js";
import { SAFETY_TIMEOUT_MS, SIGKILL_DELAY_MS } from "./constants.js";

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
    const result = childProcess.spawnSync("which", ["codex"], {
      encoding: "utf-8",
    });
    return result.status === 0;
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
      const child = childProcess.spawn("codex", args, {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      const outputLines: string[] = [];
      let stderr = "";
      let sawErrorEvent = false;
      let killed = false;

      const killChild = () => {
        if (killed) return;
        killed = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {}
        }, SIGKILL_DELAY_MS);
      };

      if (!child.stdout) {
        child.kill();
        resolve({
          success: false,
          output: "Failed to spawn codex: no stdout",
          exitCode: 1,
        });
        return;
      }

      const rl = createInterface({ input: child.stdout });

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

      const safetyTimeout = setTimeout(() => {
        process.stderr.write(
          `\n[sfk] Safety timeout reached (${SAFETY_TIMEOUT_MS / 60000} min), killing Codex process\n`,
        );
        killChild();
      }, SAFETY_TIMEOUT_MS);

      child.once("close", () => {
        clearTimeout(safetyTimeout);
      });
    });
  }

  switchToFallback(): boolean {
    return false;
  }
}
