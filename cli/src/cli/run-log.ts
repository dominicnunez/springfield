import { join } from "node:path";

export type RunLogAgent = "ralph" | "willie";

export function formatRunLogTimestamp(startedAt = new Date()): string {
  return startedAt
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
}

export function getRunLogFile(
  logDir: string,
  projectName: string,
  agent: RunLogAgent,
  startedAt = new Date(),
): string {
  return join(
    logDir,
    projectName,
    agent,
    `${formatRunLogTimestamp(startedAt)}.log`,
  );
}
