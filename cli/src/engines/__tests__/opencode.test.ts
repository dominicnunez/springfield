import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { OpenCodeEngine } from "../opencode.js";

function textEvent(text: string): string {
  return JSON.stringify({
    type: "text",
    timestamp: Date.now(),
    sessionID: "test-session",
    part: { type: "text", text },
  });
}

function stepFinishEvent(): string {
  return JSON.stringify({
    type: "step_finish",
    timestamp: Date.now(),
    sessionID: "test-session",
    part: { type: "step-finish", reason: "stop" },
  });
}

function stepFinishToolCallsEvent(): string {
  return JSON.stringify({
    type: "step_finish",
    timestamp: Date.now(),
    sessionID: "test-session",
    part: { type: "step-finish", reason: "tool-calls" },
  });
}

function stepStartEvent(): string {
  return JSON.stringify({
    type: "step_start",
    timestamp: Date.now(),
    sessionID: "test-session",
    part: { type: "step-start" },
  });
}

function errorEvent(error: {
  type?: string;
  code?: string;
  message?: string;
  name?: string;
  data?: { message?: string; responseBody?: string };
}): string {
  return JSON.stringify({
    type: "error",
    timestamp: Date.now(),
    sessionID: "test-session",
    error,
  });
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

describe("OpenCodeEngine", () => {
  describe("constructor", () => {
    test("uses default model when none provided", () => {
      const engine = new OpenCodeEngine();
      expect(engine.name).toBe("opencode");
      expect(engine.model).toBe("big-pickle");
    });

    test("uses custom model when provided", () => {
      const engine = new OpenCodeEngine("gpt-4o");
      expect(engine.model).toBe("gpt-4o");
    });

    test("stores fallback model", () => {
      const engine = new OpenCodeEngine("primary", "fallback");
      expect(engine.model).toBe("primary");
      expect(engine.isUsingFallback()).toBe(false);
    });
  });

  describe("isAvailable", () => {
    test("returns true when opencode is in PATH", () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 0,
        stdout: "/usr/bin/opencode",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      } as unknown as ReturnType<typeof childProcess.spawnSync>);

      const engine = new OpenCodeEngine();
      expect(engine.isAvailable()).toBe(true);
      expect(spy).toHaveBeenCalledWith("which", ["opencode"], {
        encoding: "utf-8",
      });

      spy.mockRestore();
    });

    test("returns false when opencode is not in PATH", () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      } as unknown as ReturnType<typeof childProcess.spawnSync>);

      const engine = new OpenCodeEngine();
      expect(engine.isAvailable()).toBe(false);

      spy.mockRestore();
    });
  });

  describe("fallback behavior", () => {
    test("switchToFallback returns false when no fallback configured", () => {
      const engine = new OpenCodeEngine("primary");
      expect(engine.switchToFallback()).toBe(false);
      expect(engine.model).toBe("primary");
    });

    test("switchToFallback switches model when fallback is configured", () => {
      const engine = new OpenCodeEngine("primary", "fallback");
      expect(engine.switchToFallback()).toBe(true);
      expect(engine.model).toBe("fallback");
      expect(engine.isUsingFallback()).toBe(true);
    });

    test("switchToFallback returns false on second call", () => {
      const engine = new OpenCodeEngine("primary", "fallback");
      expect(engine.switchToFallback()).toBe(true);
      expect(engine.switchToFallback()).toBe(false);
    });

    test("resetToPrimary restores original model", () => {
      const engine = new OpenCodeEngine("primary", "fallback");
      engine.switchToFallback();
      expect(engine.model).toBe("fallback");

      engine.resetToPrimary();
      expect(engine.model).toBe("primary");
      expect(engine.isUsingFallback()).toBe(false);
    });
  });

  describe("rate limit detection via error events", () => {
    test("detects too_many_requests error type", async () => {
      const mockChild = createMockChild([
        errorEvent({
          type: "too_many_requests",
          message: "Rate limit exceeded",
        }),
        stepFinishEvent(),
      ]);
      const spy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test prompt");

      expect(result.rateLimited).toBe(true);
      expect(result.softRateLimited).toBe(true);

      spy.mockRestore();
    });

    test("detects rate_limit in error code", async () => {
      const mockChild = createMockChild([
        errorEvent({
          code: "rate_limit_exceeded",
          message: "Too many requests",
        }),
        stepFinishEvent(),
      ]);
      const spy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test prompt");

      expect(result.rateLimited).toBe(true);
      expect(result.softRateLimited).toBe(true);

      spy.mockRestore();
    });

    test("detects hard rate limit from FreeUsageLimitError", async () => {
      const mockChild = createMockChild([
        errorEvent({
          type: "too_many_requests",
          data: { responseBody: "FreeUsageLimitError: quota exceeded" },
        }),
        stepFinishEvent(),
      ]);
      const spy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test prompt");

      expect(result.rateLimited).toBe(true);
      expect(result.hardRateLimited).toBe(true);
      expect(result.softRateLimited).toBe(false);

      spy.mockRestore();
    });

    test("does not detect rate limit for normal errors", async () => {
      const mockChild = createMockChild([
        errorEvent({ type: "validation_error", message: "Invalid input" }),
        stepFinishEvent(),
      ]);
      const spy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test prompt");

      expect(result.rateLimited).toBe(false);

      spy.mockRestore();
    });
  });

  describe("run", () => {
    let spawnSpy: ReturnType<typeof spyOn<typeof childProcess, "spawn">>;

    afterEach(() => {
      spawnSpy?.mockRestore();
    });

    test("passes correct arguments to opencode with --format json", async () => {
      const mockChild = createMockChild([stepFinishEvent()]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine("test-model");
      await engine.run("test prompt");

      expect(spawnSpy).toHaveBeenCalledWith(
        "opencode",
        [
          "run",
          "--format",
          "json",
          "--model",
          "test-model",
          "--variant",
          "high",
          "test prompt",
        ],
        expect.objectContaining({
          cwd: process.cwd(),
        }),
      );
    });

    test("passes xhigh effort as variant", async () => {
      const mockChild = createMockChild([stepFinishEvent()]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine("test-model", undefined, "xhigh");
      await engine.run("test prompt");

      expect(spawnSpy).toHaveBeenCalledWith(
        "opencode",
        [
          "run",
          "--format",
          "json",
          "--model",
          "test-model",
          "--variant",
          "xhigh",
          "test prompt",
        ],
        expect.objectContaining({
          cwd: process.cwd(),
        }),
      );
    });

    test("returns success when step_finish event received", async () => {
      const mockChild = createMockChild([
        stepStartEvent(),
        textEvent("Task completed"),
        stepFinishEvent(),
      ]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test");

      expect(result.success).toBe(true);
      expect(result.output).toContain("Task completed");
    });

    test("ignores step_finish with tool-calls reason", async () => {
      const mockChild = createMockChild([
        stepStartEvent(),
        textEvent("Working..."),
        stepFinishToolCallsEvent(),
        stepStartEvent(),
        textEvent("Task completed"),
        stepFinishEvent(),
      ]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test");

      expect(result.success).toBe(true);
      expect(result.output).toContain("Working...");
      expect(result.output).toContain("Task completed");
    });

    test("returns success on exit code 0 without step_finish", async () => {
      const mockChild = createMockChild([textEvent("Task completed")]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test");

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Task completed");
    });

    test("returns failure on non-zero exit code without step_finish", async () => {
      const mockChild = createMockChild([], ["Error occurred"], 1);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test");

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("Error occurred");
    });

    test("handles non-JSON lines as raw output", async () => {
      const mockChild = createMockChild([
        "plain text line",
        textEvent("JSON content"),
        stepFinishEvent(),
      ]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test");

      expect(result.output).toContain("plain text line");
      expect(result.output).toContain("JSON content");
      expect(result.success).toBe(true);
    });

    test("handles null status as exit code 1", async () => {
      const mockChild = createMockChild([]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const resultPromise = engine.run("test");

      mockChild.emit("close", null);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });
  });
});
