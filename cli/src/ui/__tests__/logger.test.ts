import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  initLogger,
  logAiOutput,
  logDebug,
  logError,
  logInfo,
  logIteration,
  logSessionStart,
  logSuccess,
  logWarning,
  printDivider,
  printHeader,
  printStep,
} from "../logger.js";

const TEST_LOG_DIR = "/tmp/ralph-logger-test";
const TEST_LOG_FILE = join(TEST_LOG_DIR, "test.log");

describe("logger", () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Reset logger state by re-initializing without a log file
    initLogger({});
    // Clean up test directory
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true });
    }
  });

  describe("initLogger", () => {
    test("creates log directory if it does not exist", () => {
      initLogger({ logFile: TEST_LOG_FILE });
      expect(existsSync(TEST_LOG_DIR)).toBe(true);
    });

    test("works without options", () => {
      expect(() => initLogger()).not.toThrow();
    });

    test("works with verbose mode", () => {
      expect(() => initLogger({ verbose: true })).not.toThrow();
    });
  });

  describe("console logging", () => {
    test("logInfo writes to console", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});
      logInfo("test message");
      expect(spy).toHaveBeenCalledWith("test message");
      spy.mockRestore();
    });

    test("logInfo writes step-prefixed messages in green", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});
      try {
        logInfo("Step 1: Running audit...");
        expect(spy).toHaveBeenCalled();
        const call = spy.mock.calls[0][0];
        expect(call).toContain("Step 1: Running audit...");
      } finally {
        spy.mockRestore();
      }
    });

    test("logSuccess writes green text to console", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});
      logSuccess("success message");
      expect(spy).toHaveBeenCalled();
      const call = spy.mock.calls[0][0];
      expect(call).toContain("success message");
      spy.mockRestore();
    });

    test("logWarning writes yellow text with WARN prefix", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});
      logWarning("warning message");
      expect(spy).toHaveBeenCalled();
      const call = spy.mock.calls[0][0];
      expect(call).toContain("[WARN]");
      expect(call).toContain("warning message");
      spy.mockRestore();
    });

    test("logError writes red text with ERROR prefix to stderr", () => {
      const spy = spyOn(console, "error").mockImplementation(() => {});
      logError("error message");
      expect(spy).toHaveBeenCalled();
      const call = spy.mock.calls[0][0];
      expect(call).toContain("[ERROR]");
      expect(call).toContain("error message");
      spy.mockRestore();
    });

    test("logDebug writes nothing when verbose is false", () => {
      initLogger({ verbose: false });
      const spy = spyOn(console, "log").mockImplementation(() => {});
      logDebug("debug message");
      // Should not have been called for debug message
      const debugCalls = spy.mock.calls.filter((call) =>
        call[0]?.includes?.("[DEBUG]"),
      );
      expect(debugCalls.length).toBe(0);
      spy.mockRestore();
    });

    test("logDebug writes when verbose is true", () => {
      initLogger({ verbose: true });
      const spy = spyOn(console, "log").mockImplementation(() => {});
      logDebug("debug message");
      expect(spy).toHaveBeenCalled();
      const call = spy.mock.calls[0][0];
      expect(call).toContain("[DEBUG]");
      expect(call).toContain("debug message");
      spy.mockRestore();
    });
  });

  describe("file logging", () => {
    test("writes to log file when configured", () => {
      initLogger({ logFile: TEST_LOG_FILE });
      logInfo("file test");

      const content = readFileSync(TEST_LOG_FILE, "utf-8");
      expect(content).toContain("[INFO]");
      expect(content).toContain("file test");
    });

    test("includes timestamp in log file", () => {
      initLogger({ logFile: TEST_LOG_FILE });
      logInfo("timestamp test");

      const content = readFileSync(TEST_LOG_FILE, "utf-8");
      // Timestamp format: [YYYY-MM-DD HH:MM:SS]
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/);
    });

    test("logs different levels correctly", () => {
      initLogger({ logFile: TEST_LOG_FILE });

      // Suppress console output
      const logSpy = spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = spyOn(console, "error").mockImplementation(() => {});

      logInfo("info test");
      logWarning("warn test");
      logError("error test");

      const content = readFileSync(TEST_LOG_FILE, "utf-8");
      expect(content).toContain("[INFO] info test");
      expect(content).toContain("[WARN] warn test");
      expect(content).toContain("[ERROR] error test");

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test("logDebug always writes to file even when not verbose", () => {
      initLogger({ logFile: TEST_LOG_FILE, verbose: false });

      logDebug("debug file test");

      const content = readFileSync(TEST_LOG_FILE, "utf-8");
      expect(content).toContain("[DEBUG]");
      expect(content).toContain("debug file test");
    });
  });

  describe("logIteration", () => {
    test("formats iteration with max iterations", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});

      logIteration(3, 10, "implement feature", "gpt-4");

      const calls = spy.mock.calls.map((c) => c[0]).join("\n");
      expect(calls).toContain("Iteration 3 of 10");
      expect(calls).toContain("gpt-4");
      expect(calls).toContain("implement feature");

      spy.mockRestore();
    });

    test("formats iteration with infinite mode", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});

      logIteration(5, -1, "continuous task", "claude");

      const calls = spy.mock.calls.map((c) => c[0]).join("\n");
      expect(calls).toContain("5 (infinite mode)");

      spy.mockRestore();
    });
  });

  describe("logSessionStart", () => {
    test("writes session header to log file", () => {
      initLogger({ logFile: TEST_LOG_FILE });

      logSessionStart("my-project", "opencode", "gpt-4");

      const content = readFileSync(TEST_LOG_FILE, "utf-8");
      expect(content).toContain("Ralph Session Started");
      expect(content).toContain("my-project");
      expect(content).toContain("opencode");
      expect(content).toContain("gpt-4");
    });

    test("does nothing when no log file configured", () => {
      initLogger({});
      // Should not throw
      expect(() => logSessionStart("project", "engine", "model")).not.toThrow();
    });
  });

  describe("logAiOutput", () => {
    test("writes output to log file", () => {
      initLogger({ logFile: TEST_LOG_FILE });

      logAiOutput("AI response text");

      const content = readFileSync(TEST_LOG_FILE, "utf-8");
      expect(content).toContain("AI response text");
    });

    test("truncates long output", () => {
      initLogger({ logFile: TEST_LOG_FILE });

      const longOutput = Array(100).fill("line").join("\n");
      logAiOutput(longOutput, 10);

      const content = readFileSync(TEST_LOG_FILE, "utf-8");
      expect(content).toContain("[... truncated ...]");
    });

    test("does not truncate short output", () => {
      initLogger({ logFile: TEST_LOG_FILE });

      const shortOutput = Array(5).fill("line").join("\n");
      logAiOutput(shortOutput, 10);

      const content = readFileSync(TEST_LOG_FILE, "utf-8");
      expect(content).not.toContain("[... truncated ...]");
    });

    test("does nothing when no log file configured", () => {
      initLogger({});
      expect(() => logAiOutput("test")).not.toThrow();
    });
  });

  describe("print helpers", () => {
    test("printHeader writes to console", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});
      printHeader("Header Text");
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    test("printStep writes to console", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});
      printStep("Step text");
      expect(spy).toHaveBeenCalled();
      const call = spy.mock.calls[0][0];
      expect(call).toContain("Step text");
      spy.mockRestore();
    });

    test("printDivider writes to console", () => {
      const spy = spyOn(console, "log").mockImplementation(() => {});
      printDivider();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
