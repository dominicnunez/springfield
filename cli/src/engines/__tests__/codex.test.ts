import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { CodexEngine } from "../codex.js";

function eventLine(event: Record<string, unknown>): string {
  return JSON.stringify(event);
}

function createMockChild(
  stdoutLines: string[],
  stderrChunks: string[] = [],
  exitCode = 0,
): EventEmitter & {
  stdout: Readable;
  stderr: Readable;
  pid: number;
  kill: (signal?: string) => void;
} {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const child = new EventEmitter() as ReturnType<typeof createMockChild>;

  child.stdout = stdout;
  child.stderr = stderr;
  child.pid = 1000;

  child.kill = () => {
    stdout.push(null);
    stderr.push(null);
    setImmediate(() => child.emit("close", 0));
  };

  setImmediate(() => {
    for (const line of stdoutLines) {
      stdout.push(`${line}\n`);
    }
    for (const chunk of stderrChunks) {
      stderr.push(chunk);
    }
    stdout.push(null);
    stderr.push(null);
    setImmediate(() => child.emit("close", exitCode));
  });

  return child;
}

describe("CodexEngine", () => {
  describe("isAvailable", () => {
    test("returns true when codex is in PATH", () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 0,
        stdout: "/usr/bin/codex",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      } as unknown as ReturnType<typeof childProcess.spawnSync>);

      expect(new CodexEngine().isAvailable()).toBe(true);
      expect(spy).toHaveBeenCalledWith("which", ["codex"], {
        encoding: "utf-8",
      });
      spy.mockRestore();
    });

    test("returns false when codex is not in PATH", () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      } as unknown as ReturnType<typeof childProcess.spawnSync>);

      expect(new CodexEngine().isAvailable()).toBe(false);
      spy.mockRestore();
    });
  });

  describe("run", () => {
    let spawnSpy: ReturnType<typeof spyOn<typeof childProcess, "spawn">>;

    afterEach(() => {
      spawnSpy?.mockRestore();
    });

    test("passes expected codex exec args with model override", async () => {
      const child = createMockChild([
        eventLine({
          type: "item.completed",
          item: { type: "agent_message", text: "done" },
        }),
      ]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>,
      );

      await new CodexEngine("gpt-5").run("test prompt");

      expect(spawnSpy).toHaveBeenCalledWith(
        "codex",
        [
          "exec",
          "--json",
          "--dangerously-bypass-approvals-and-sandbox",
          "--skip-git-repo-check",
          "--model",
          "gpt-5",
          "test prompt",
        ],
        expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
      );
    });

    test("returns agent message text from item.completed events", async () => {
      const child = createMockChild([
        eventLine({
          type: "item.completed",
          item: { type: "reasoning", text: "ignored" },
        }),
        eventLine({
          type: "item.completed",
          item: { type: "agent_message", text: "hello" },
        }),
        eventLine({
          type: "item.completed",
          item: { type: "agent_message", text: "world" },
        }),
      ]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new CodexEngine().run("test");
      expect(result.success).toBe(true);
      expect(result.output).toBe("hello\nworld");
    });

    test("marks run as failed when an error event appears", async () => {
      const child = createMockChild([
        eventLine({ type: "error", message: "request failed" }),
      ]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new CodexEngine().run("test");
      expect(result.success).toBe(false);
      expect(result.output).toContain("request failed");
    });

    test("preserves non-json stdout lines", async () => {
      const child = createMockChild(["plain output line"]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new CodexEngine().run("test");
      expect(result.success).toBe(true);
      expect(result.output).toContain("plain output line");
    });
  });
});
