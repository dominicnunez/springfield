import * as childProcess from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { SAFETY_TIMEOUT_MS, SIGKILL_DELAY_MS } from "./constants.js";

export interface LineProcess {
  child: ReturnType<typeof childProcess.spawn>;
  rl: Interface;
  killChild: () => void;
  installSafetyTimeout: (label: string, shouldKill?: () => boolean) => void;
}

export function commandExists(binary: string): boolean {
  try {
    const result = childProcess.spawnSync("which", [binary], {
      encoding: "utf-8",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function spawnLineProcess(
  command: string,
  args: string[],
  stdio: childProcess.StdioOptions,
  env?: NodeJS.ProcessEnv,
): LineProcess | { error: string } {
  const child = childProcess.spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio,
  });

  let killed = false;

  const killChild = () => {
    if (killed) {
      return;
    }

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
    return { error: `Failed to spawn ${command}: no stdout` };
  }

  const rl = createInterface({ input: child.stdout });

  return {
    child,
    rl,
    killChild,
    installSafetyTimeout: (label: string, shouldKill = () => true) => {
      const safetyTimeout = setTimeout(() => {
        if (!shouldKill()) {
          return;
        }

        process.stderr.write(
          `\n[sfk] Safety timeout reached (${SAFETY_TIMEOUT_MS / 60000} min), killing ${label}\n`,
        );
        killChild();
      }, SAFETY_TIMEOUT_MS);

      child.once("close", () => {
        clearTimeout(safetyTimeout);
      });
    },
  };
}
