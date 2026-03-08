import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as childProcess from "node:child_process";
import { runGitLines, runGitStdout } from "../git.js";

describe("git helpers", () => {
  let spawnSyncSpy:
    | ReturnType<typeof spyOn<typeof childProcess, "spawnSync">>
    | undefined;

  afterEach(() => {
    spawnSyncSpy?.mockRestore();
  });

  test("runGitStdout returns trimmed stdout on success", () => {
    spawnSyncSpy = spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 0,
      stdout: "abc123\n",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    expect(runGitStdout(["rev-parse", "HEAD"])).toBe("abc123");
    expect(spawnSyncSpy).toHaveBeenCalledWith("git", ["rev-parse", "HEAD"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  });

  test("runGitStdout returns null on failed command", () => {
    spawnSyncSpy = spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "fatal",
      pid: 1,
      output: [],
      signal: null,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    expect(runGitStdout(["rev-parse", "HEAD"])).toBeNull();
  });

  test("runGitLines returns non-empty stdout lines", () => {
    spawnSyncSpy = spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 0,
      stdout: "a.test.ts\n\nb.ts\n",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    expect(runGitLines(["diff", "--name-only"], "git diff")).toEqual([
      "a.test.ts",
      "b.ts",
    ]);
  });

  test("runGitLines returns empty array on git error", () => {
    spawnSyncSpy = spyOn(childProcess, "spawnSync").mockReturnValue({
      status: null,
      stdout: "",
      stderr: "",
      error: new Error("boom"),
      pid: 1,
      output: [],
      signal: null,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    expect(runGitLines(["diff", "--name-only"], "git diff")).toEqual([]);
  });
});
