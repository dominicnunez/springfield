import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { OpenCodeEngine } from "../opencode.js";

const cjsChildProcess = createRequire(import.meta.url)(
  "node:child_process",
) as typeof childProcess;

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
      const spy = spyOn(cjsChildProcess, "spawnSync").mockReturnValue({
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
      const spy = spyOn(cjsChildProcess, "spawnSync").mockReturnValue({
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

  describe("rate limit detection", () => {
    const rateLimitPatterns = [
      // Soft rate limit patterns
      "Error: rate limit exceeded",
      "statusCode 429 returned",
      "Too many requests, slow down",
      "tokens per minute limit reached",
      "at capacity, please wait",
      "retry after 30 seconds",
      // Hard rate limit patterns
      "insufficient_quota for this request",
      "insufficient balance on account",
      "exceeded current quota for usage tier",
      "please update billing details",
    ];

    for (const pattern of rateLimitPatterns) {
      test(`detects rate limit pattern: "${pattern}"`, async () => {
        const mockChild = createMockChild([pattern]);
        const spy = spyOn(childProcess, "spawn").mockReturnValue(
          mockChild as unknown as ReturnType<typeof childProcess.spawn>,
        );

        const engine = new OpenCodeEngine();
        const result = await engine.run("test prompt");

        expect(result.rateLimited).toBe(true);

        spy.mockRestore();
      });
    }

    test("classifies hard rate limits correctly", async () => {
      const mockChild = createMockChild([
        "insufficient_quota for this request",
      ]);
      const spy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test prompt");

      expect(result.hardRateLimited).toBe(true);
      expect(result.softRateLimited).toBe(false);

      spy.mockRestore();
    });

    test("classifies soft rate limits correctly", async () => {
      const mockChild = createMockChild(["Error: rate limit exceeded"]);
      const spy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test prompt");

      expect(result.softRateLimited).toBe(true);
      expect(result.hardRateLimited).toBe(false);

      spy.mockRestore();
    });

    test("does not detect rate limit for normal errors", async () => {
      const mockChild = createMockChild(["Error: file not found"]);
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

    test("passes correct arguments to opencode", async () => {
      const mockChild = createMockChild([]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine("test-model");
      await engine.run("test prompt");

      expect(spawnSpy).toHaveBeenCalledWith(
        "opencode",
        ["run", "--model", "test-model", "test prompt"],
        expect.objectContaining({
          cwd: process.cwd(),
        }),
      );
    });

    test("returns success result on exit code 0", async () => {
      const mockChild = createMockChild(["Task completed"]);
      spawnSpy = spyOn(childProcess, "spawn").mockReturnValue(
        mockChild as unknown as ReturnType<typeof childProcess.spawn>,
      );

      const engine = new OpenCodeEngine();
      const result = await engine.run("test");

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Task completed");
    });

    test("returns failure result on non-zero exit code", async () => {
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
