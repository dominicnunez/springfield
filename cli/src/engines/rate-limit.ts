import { logInfo, logWarning } from "../ui/logger.js";

const EXPONENTIAL_BACKOFF_MULTIPLIER = 2;

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export async function handleSoftRateLimit(
  attempt: number,
  maxRetries: number,
  baseWait: number,
): Promise<boolean> {
  if (attempt >= maxRetries) {
    logWarning(`Soft rate limit: exhausted ${maxRetries} retries`);
    return false;
  }

  const waitTime = baseWait * EXPONENTIAL_BACKOFF_MULTIPLIER ** attempt;

  logInfo(
    `Soft rate limit: waiting ${waitTime}s (attempt ${attempt + 1}/${maxRetries})`,
  );

  await sleep(waitTime);
  return true;
}
