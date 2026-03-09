import { describe, expect, test } from "bun:test";
import type { EffortLevel } from "../../config/loader.js";
import {
  InvalidEffortLevelError,
  getEngineEffortConfig,
} from "../effort.js";

describe("engine effort helpers", () => {
  test("returns Claude env config for supported effort", () => {
    expect(getEngineEffortConfig("claude", "high")).toEqual({
      env: { CLAUDE_CODE_EFFORT_LEVEL: "high" },
    });
  });

  test("returns Codex config override for supported effort", () => {
    expect(getEngineEffortConfig("codex", "xhigh")).toEqual({
      args: ["-c", "model_reasoning_effort=xhigh"],
    });
  });

  test("returns OpenCode variant args for supported effort", () => {
    expect(getEngineEffortConfig("opencode", "medium")).toEqual({
      args: ["--variant", "medium"],
    });
  });

  test("throws a clear error for unsupported effort on an engine", () => {
    expect(() =>
      getEngineEffortConfig("claude", "xhigh" satisfies EffortLevel),
    ).toThrow(InvalidEffortLevelError);
    expect(() =>
      getEngineEffortConfig("claude", "xhigh" satisfies EffortLevel),
    ).toThrow(
      'Invalid effort level "xhigh" for claude. Supported levels: low, medium, high.',
    );
  });
});
