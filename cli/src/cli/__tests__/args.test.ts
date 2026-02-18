import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "../args.js";

describe("parseArgs single task detection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sfk-args-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should treat non-directory positional arg as single task", () => {
    const { command, options } = parseArgs(["node", "sfk", "add dark mode toggle"]);
    expect(command).toBe("run");
    expect(options.singleTask).toBe("add dark mode toggle");
  });

  it("should not set singleTask for directory positional arg", () => {
    const { command, options } = parseArgs(["node", "sfk", tempDir]);
    expect(command).toBe("run");
    expect(options.singleTask).toBeUndefined();
  });

  it("should leave singleTask undefined when no positional args", () => {
    const { command, options } = parseArgs(["node", "sfk"]);
    expect(command).toBe("run");
    expect(options.singleTask).toBeUndefined();
  });

  it("should parse audit command", () => {
    const { command, auditOptions } = parseArgs(["node", "sfk", "audit"]);
    expect(command).toBe("audit");
    expect(auditOptions.startStep).toBe("audit");
  });

  it("should parse audit command with step option", () => {
    const { command, auditOptions } = parseArgs(["node", "sfk", "audit", "--step", "fix"]);
    expect(command).toBe("audit");
    expect(auditOptions.startStep).toBe("fix");
  });
});
