import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as childProcess from "node:child_process";
import { notify } from "../notify.js";

describe("notify", () => {
  let spawnSyncSpy:
    | ReturnType<typeof spyOn<typeof childProcess, "spawnSync">>
    | undefined;

  afterEach(() => {
    spawnSyncSpy?.mockRestore();
  });

  test("does nothing when openclaw is unavailable", () => {
    spawnSyncSpy = spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    notify("hello");

    expect(spawnSyncSpy).toHaveBeenCalledTimes(1);
    expect(spawnSyncSpy).toHaveBeenCalledWith("which", ["openclaw"], {
      encoding: "utf-8",
    });
  });

  test("wakes openclaw when the command exists", () => {
    spawnSyncSpy = spyOn(childProcess, "spawnSync")
      .mockReturnValueOnce({
        status: 0,
        stdout: "/usr/bin/openclaw\n",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      } as unknown as ReturnType<typeof childProcess.spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      } as unknown as ReturnType<typeof childProcess.spawnSync>);

    notify("wake up");

    expect(spawnSyncSpy).toHaveBeenNthCalledWith(1, "which", ["openclaw"], {
      encoding: "utf-8",
    });
    expect(spawnSyncSpy).toHaveBeenNthCalledWith(
      2,
      "openclaw",
      ["cron", "wake", "wake up"],
      {
        encoding: "utf-8",
        stdio: "ignore",
      },
    );
  });
});
