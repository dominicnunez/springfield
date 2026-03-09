import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { ClaudeEngine } from "../claude.js";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/**
 * Build a fake child process whose stdout/stderr are Readable streams.
 *
 * Lines are pushed asynchronously (setImmediate) so listeners are attached
 * before data arrives — matching real spawn behaviour.
 *
 * When kill("SIGTERM") is called the engine expects the child to die; our mock
 * ends both streams immediately and schedules a "close" event.
 */
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
  child.pid = 12345;

  let stdoutEnded = false;
  let closeScheduled = false;

  const scheduleClose = (code: number) => {
    if (!closeScheduled) {
      closeScheduled = true;
      setImmediate(() => child.emit("close", code));
    }
  };

  const endStreams = () => {
    if (!stdoutEnded) {
      stdoutEnded = true;
      stdout.push(null);
      stderr.push(null);
    }
  };

  child.kill = (_signal?: string) => {
    endStreams();
    scheduleClose(0);
  };

  // Push data after listeners are attached
  setImmediate(() => {
    for (const line of stdoutLines) {
      stdout.push(`${line}\n`);
    }
    for (const chunk of stderrChunks) {
      stderr.push(chunk);
    }
    endStreams();
    scheduleClose(exitCode);
  });

  return child;
}

/** Build a stream-json result event line */
function resultEvent(result: string, isError = false): string {
  return JSON.stringify({ type: "result", result, is_error: isError });
}

/** Build a stream-json assistant message line */
function assistantEvent(text: string): string {
  return JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text }] },
  });
}

/** Build a text-delta stream event line */
function textDeltaEvent(text: string): string {
  return JSON.stringify({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text },
    },
  });
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

describe("ClaudeEngine", () => {
  describe("constructor", () => {
    test("uses default model when none provided", () => {
      const engine = new ClaudeEngine();
      expect(engine.name).toBe("claude");
      expect(engine.model).toBe("opus");
    });

    test("uses custom model when provided", () => {
      const engine = new ClaudeEngine("sonnet");
      expect(engine.model).toBe("sonnet");
    });
  });

  // ── isAvailable ────────────────────────────────────────────
  // isAvailable() calls require("node:child_process") at runtime, so we spy on
  // the CJS module object (same cached instance) rather than the ESM namespace.
  describe("isAvailable", () => {
    test("returns true when claude is in PATH", () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 0,
        stdout: "/usr/bin/claude\n",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      } as unknown as ReturnType<typeof childProcess.spawnSync>);

      const engine = new ClaudeEngine();
      expect(engine.isAvailable()).toBe(true);
      spy.mockRestore();
    });

    test("returns false when claude is not in PATH", () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      } as unknown as ReturnType<typeof childProcess.spawnSync>);

      const engine = new ClaudeEngine();
      expect(engine.isAvailable()).toBe(false);
      spy.mockRestore();
    });

    test("returns false when spawnSync throws", () => {
      const spy = spyOn(childProcess, "spawnSync").mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });

      const engine = new ClaudeEngine();
      expect(engine.isAvailable()).toBe(false);
      spy.mockRestore();
    });
  });

  // ── switchToFallback ───────────────────────────────────────
  describe("switchToFallback", () => {
    test("always returns false", () => {
      const engine = new ClaudeEngine("opus");
      expect(engine.switchToFallback()).toBe(false);
      expect(engine.model).toBe("opus"); // unchanged
    });
  });

  // ── run ───────────────────────────────────────────────────
  describe("run", () => {
    let spawnSpy: ReturnType<typeof spyOn<typeof childProcess, "spawn">>;

    afterEach(() => {
      spawnSpy?.mockRestore();
    });

    test("passes correct CLI arguments to claude", async () => {
      const mock = createMockChild([resultEvent("done")]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new ClaudeEngine("sonnet");
      await engine.run("test prompt");

      expect(spawnSpy).toHaveBeenCalledWith(
        "claude",
        [
          "--model",
          "sonnet",
          "--dangerously-skip-permissions",
          "--no-session-persistence",
          "--output-format",
          "stream-json",
          "--verbose",
          "-p",
          "test prompt",
        ],
        expect.objectContaining({
          stdio: ["ignore", "pipe", "pipe"],
          env: expect.objectContaining({
            CLAUDE_CODE_EFFORT_LEVEL: "high",
          }),
        }),
      );
    });

    test("passes configured effort through env", async () => {
      const mock = createMockChild([resultEvent("done")]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      await new ClaudeEngine("sonnet", "medium").run("test prompt");

      expect(spawnSpy).toHaveBeenCalledWith(
        "claude",
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            CLAUDE_CODE_EFFORT_LEVEL: "medium",
          }),
        }),
      );
    });

    test("returns success when result event has is_error=false", async () => {
      const mock = createMockChild([resultEvent("Task done")]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new ClaudeEngine().run("do something");

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe("Task done");
      expect(result.rateLimited).toBe(false);
    });

    test("returns failure when result event has is_error=true", async () => {
      const mock = createMockChild([resultEvent("Something went wrong", true)]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new ClaudeEngine().run("do something");

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.rateLimited).toBe(false);
    });

    test("falls back to exit-code check when no result event fires", async () => {
      const mock = createMockChild([], ["some error on stderr"], 1);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new ClaudeEngine().run("test");

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    test("exit code 0 with no result event resolves success", async () => {
      const mock = createMockChild([], [], 0);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new ClaudeEngine().run("test");

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    test("result field from result event becomes output", async () => {
      const mock = createMockChild([
        assistantEvent("intermediate"),
        resultEvent("final output here"),
      ]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new ClaudeEngine().run("test");

      expect(result.output).toBe("final output here");
    });

    test("accumulates text_delta events into output before result arrives", async () => {
      const mock = createMockChild([
        textDeltaEvent("Hello "),
        textDeltaEvent("world"),
        resultEvent("Hello world"),
      ]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new ClaudeEngine().run("test");

      expect(result.output).toBe("Hello world");
    });

    test("non-JSON lines in stdout don't crash the engine", async () => {
      const mock = createMockChild([
        "plain text line",
        resultEvent("result output"),
      ]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new ClaudeEngine().run("test");

      expect(result.success).toBe(true);
      expect(result.output).toBe("result output");
    });

    test("kills child process after result event is received", async () => {
      const mock = createMockChild([resultEvent("done")]);
      const killSpy = spyOn(mock, "kill");
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      await new ClaudeEngine().run("test");

      expect(killSpy).toHaveBeenCalledWith("SIGTERM");
    });

    test("rateLimited is always false when result event is present", async () => {
      const mock = createMockChild([resultEvent("done")]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new ClaudeEngine().run("test");

      expect(result.rateLimited).toBe(false);
    });

    test("rateLimited is false even without result event (no detection in this engine)", async () => {
      // The engine only does rate-limit detection in the no-result-event branch,
      // but the claude engine design doesn't set rateLimited=true — it always returns false
      // in the result-event path and uses text matching in the fallback path.
      // This test covers the no-result-event fallback: output doesn't contain rate-limit text.
      const mock = createMockChild([], [], 0);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mock as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const result = await new ClaudeEngine().run("test");

      expect(result.rateLimited).toBe(false);
    });
  });
});
