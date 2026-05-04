import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { formatRunLogTimestamp, getRunLogFile } from "../run-log.js";

describe("run log paths", () => {
  test("formats timestamps without filesystem-hostile separators", () => {
    const timestamp = formatRunLogTimestamp(
      new Date("2026-05-01T14:32:10.123Z"),
    );

    expect(timestamp).toBe("2026-05-01T14-32-10Z");
  });

  test("builds repo and agent scoped log file paths", () => {
    const logFile = getRunLogFile(
      "/tmp/logs",
      "springfield",
      "willie",
      new Date("2026-05-01T14:32:10.123Z"),
    );

    expect(logFile).toBe(
      join("/tmp/logs", "springfield", "willie", "2026-05-01T14-32-10Z.log"),
    );
  });
});
