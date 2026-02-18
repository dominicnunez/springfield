import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { OpenCodeEngine } from "../opencode.js";
import * as childProcess from "node:child_process";

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
      });
      
      const engine = new OpenCodeEngine();
      expect(engine.isAvailable()).toBe(true);
      expect(spy).toHaveBeenCalledWith("which", ["opencode"], { encoding: "utf-8" });
      
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
      });
      
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
    // Test via run() output since isRateLimited is private
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
        const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
          status: 1,
          stdout: pattern,
          stderr: "",
          pid: 1,
          output: [],
          signal: null,
        });
        
        const engine = new OpenCodeEngine();
        const result = await engine.run("test prompt");
        
        expect(result.rateLimited).toBe(true);
        
        spy.mockRestore();
      });
    }

    test("classifies hard rate limits correctly", async () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 1,
        stdout: "insufficient_quota for this request",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      });

      const engine = new OpenCodeEngine();
      const result = await engine.run("test prompt");

      expect(result.hardRateLimited).toBe(true);
      expect(result.softRateLimited).toBe(false);

      spy.mockRestore();
    });

    test("classifies soft rate limits correctly", async () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 1,
        stdout: "Error: rate limit exceeded",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      });

      const engine = new OpenCodeEngine();
      const result = await engine.run("test prompt");

      expect(result.softRateLimited).toBe(true);
      expect(result.hardRateLimited).toBe(false);

      spy.mockRestore();
    });

    test("does not detect rate limit for normal errors", async () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 1,
        stdout: "Error: file not found",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      });
      
      const engine = new OpenCodeEngine();
      const result = await engine.run("test prompt");
      
      expect(result.rateLimited).toBe(false);
      
      spy.mockRestore();
    });
  });

  describe("run", () => {
    test("passes correct arguments to opencode", async () => {
      const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
        status: 0,
        stdout: "Success output",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      });
      
      const engine = new OpenCodeEngine("test-model");
      await engine.run("test prompt");
      
      expect(spy).toHaveBeenCalledWith(
        "opencode",
        ["run", "--model", "test-model", "test prompt"],
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
      
      const engine = new OpenCodeEngine();
      const result = await engine.run("test");
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Task completed");
      
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
      
      const engine = new OpenCodeEngine();
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
      
      const engine = new OpenCodeEngine();
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
      
      const engine = new OpenCodeEngine();
      const result = await engine.run("test");
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      
      spy.mockRestore();
    });
  });
});
