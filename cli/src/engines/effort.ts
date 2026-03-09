import type { EffortLevel, EngineType } from "../config/loader.js";

const SUPPORTED_EFFORT_LEVELS: Record<EngineType, readonly EffortLevel[]> = {
  claude: ["low", "medium", "high"],
  codex: ["low", "medium", "high", "xhigh"],
  opencode: ["low", "medium", "high", "xhigh"],
};

interface EngineEffortConfig {
  args?: string[];
  env?: Record<string, string>;
}

export class InvalidEffortLevelError extends Error {
  constructor(
    public readonly engine: EngineType,
    public readonly effort: EffortLevel,
    public readonly supportedLevels: readonly EffortLevel[],
  ) {
    super(
      `Invalid effort level "${effort}" for ${engine}. Supported levels: ${supportedLevels.join(", ")}.`,
    );
    this.name = "InvalidEffortLevelError";
  }
}

export function getSupportedEffortLevels(
  engine: EngineType,
): readonly EffortLevel[] {
  return SUPPORTED_EFFORT_LEVELS[engine];
}

export function assertEffortSupported(
  engine: EngineType,
  effort: EffortLevel,
): void {
  const supportedLevels = getSupportedEffortLevels(engine);
  if (!supportedLevels.includes(effort)) {
    throw new InvalidEffortLevelError(engine, effort, supportedLevels);
  }
}

export function getEngineEffortConfig(
  engine: EngineType,
  effort: EffortLevel,
): EngineEffortConfig {
  assertEffortSupported(engine, effort);

  if (engine === "claude") {
    return { env: { CLAUDE_CODE_EFFORT_LEVEL: effort } };
  }

  if (engine === "codex") {
    return { args: ["-c", `model_reasoning_effort=${effort}`] };
  }

  return { args: ["--variant", effort] };
}
