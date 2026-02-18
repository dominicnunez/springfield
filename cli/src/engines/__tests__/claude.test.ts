import { describe, expect, test, spyOn } from "bun:test";
import { ClaudeEngine } from "../claude.js";
import * as childProcess from "node:child_process";

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

  describe("isAvailable", () => {
    test("returns true when claude is in PATH", () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 0,
        stdout: "/usr/bin/claude",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      });
      
      const engine = new ClaudeEngine();
      expect(engine.isAvailable()).toBe(true);
      expect(spy).toHaveBeenCalledWith("which", ["claude"], { encoding: "utf-8" });
      
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
      });
      
      const engine = new ClaudeEngine();
      expect(engine.isAvailable()).toBe(false);
      
      spy.mockRestore();
    });
  });

  describe("switchToFallback", () => {
    test("always returns false (no fallback support)", () => {
      const engine = new ClaudeEngine("opus");
      expect(engine.switchToFallback()).toBe(false);
      expect(engine.model).toBe("opus"); // Model unchanged
    });
  });

  describe("run", () => {
    test("passes correct arguments to claude", async () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 0,
        stdout: "Success output",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      });
      
      const engine = new ClaudeEngine("sonnet");
      await engine.run("test prompt");
      
      expect(spy).toHaveBeenCalledWith(
        "claude",
        ["--model", "sonnet", "--effort", "high", "--dangerously-skip-permissions", "-p", "test prompt"],
        expect.objectContaining({
          encoding: "utf-8",
          maxBuffer: 50 * 1024 * 1024,
        })
      );
      
      spy.mockRestore();
    });

    test("returns success result on exit code 0", async () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 0,
        stdout: "Task completed",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      });
      
      const engine = new ClaudeEngine();
      const result = await engine.run("test");
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Task completed");
      expect(result.rateLimited).toBe(false);
      
      spy.mockRestore();
    });

    test("returns failure result on non-zero exit code", async () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "Error occurred",
        pid: 1,
        output: [],
        signal: null,
      });
      
      const engine = new ClaudeEngine();
      const result = await engine.run("test");
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("Error occurred");
      
      spy.mockRestore();
    });

    test("combines stdout and stderr in output", async () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 0,
        stdout: "stdout content",
        stderr: "stderr content",
        pid: 1,
        output: [],
        signal: null,
      });
      
      const engine = new ClaudeEngine();
      const result = await engine.run("test");
      
      expect(result.output).toContain("stdout content");
      expect(result.output).toContain("stderr content");
      
      spy.mockRestore();
    });

    test("handles null status as exit code 1", async () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: null,
        stdout: "",
        stderr: "",
        pid: 1,
        output: [],
        signal: "SIGTERM",
      });
      
      const engine = new ClaudeEngine();
      const result = await engine.run("test");
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      
      spy.mockRestore();
    });

    test("rateLimited is always false", async () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 1,
        stdout: "rate limit exceeded",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      });
      
      const engine = new ClaudeEngine();
      const result = await engine.run("test");
      
      // ClaudeEngine doesn't support rate limit detection
      expect(result.rateLimited).toBe(false);
      
      spy.mockRestore();
    });
  });
});
