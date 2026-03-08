import { describe, expect, spyOn, test } from "bun:test";
import * as childProcess from "node:child_process";
import { commandExists } from "../process.js";

describe("engine process helpers", () => {
  test("commandExists returns true when binary is in PATH", () => {
    const spy = spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 0,
      stdout: "/usr/bin/tool\n",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    expect(commandExists("tool")).toBe(true);
    expect(spy).toHaveBeenCalledWith("which", ["tool"], {
      encoding: "utf-8",
    });
    spy.mockRestore();
  });

  test("commandExists returns false when binary lookup fails", () => {
    const spy = spyOn(childProcess, "spawnSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(commandExists("missing-tool")).toBe(false);
    spy.mockRestore();
  });
});
