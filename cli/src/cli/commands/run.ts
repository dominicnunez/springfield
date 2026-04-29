import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import pc from "picocolors";
import type { Config } from "../../config/loader.js";
import { getCurrentModel, getRalphEffort } from "../../config/loader.js";
import {
  COMPLETE_MARKER,
  type Engine,
  type EngineResult,
  generateFixTestsPrompt,
  generatePrompt,
  generateSingleTaskPrompt,
} from "../../engines/base.js";
import {
  allTasksComplete,
  countIncompleteTasks,
  getFirstIncompleteTask,
  parsePrd,
} from "../../tasks/parser.js";
import {
  appendFailure,
  getProgressFile,
  initProgress,
} from "../../tasks/progress.js";
import { detectTestCommand, verify } from "../../tasks/verification.js";
import {
  initLogger,
  logAiOutput,
  logError,
  logInfo,
  logIteration,
  logSessionStart,
  logSuccess,
  logWarning,
} from "../../ui/logger.js";
import { initializeRalphEngine } from "../engine-factory.js";
import { runGitStdout } from "../git.js";
import { notify } from "../notify.js";
import { resolveRunRateLimitAction } from "../run-rate-limit.js";

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function pushAfterCommit(headBefore: string): void {
  const headAfter = runGitStdout(["rev-parse", "HEAD"]);

  if (!headBefore || !headAfter || headBefore === headAfter) return;

  logInfo("New commit detected, pushing to origin");
  console.log("  Pushing changes to origin...");

  const branch = runGitStdout(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch) {
    logWarning("Failed to detect current branch, skipping push");
    console.log("  Failed to detect branch (will retry next iteration)");
    return;
  }

  const hasUpstream =
    runGitStdout([
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]) !== null;

  const pushArgs = hasUpstream ? ["push"] : ["push", "-u", "origin", branch];

  const pushResult = spawnSync("git", pushArgs, {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (pushResult.status === 0) {
    logInfo("Push successful");
    console.log(`  Pushed to origin/${branch}`);
  } else {
    logWarning(
      `Push failed: ${pushResult.stderr || "unknown error"} (will retry next iteration)`,
    );
    console.log("  Push failed (will retry next iteration)");
  }
}

function getHeadSha(): string | null {
  return runGitStdout(["rev-parse", "HEAD"]);
}

export interface RunOptions {
  prdPath: string;
  verbose?: boolean;
}

interface RunSession {
  projectName: string;
  logFile: string;
  progressFile: string;
  engine: Engine;
  testCmd: string | undefined;
  model: string;
}

interface VerificationState {
  consecutiveFailures: number;
  lastFailedTask: string;
  testFailureMode: boolean;
  lastTestOutput: string;
}

interface VerificationDecision {
  status: "passed" | "retry" | "exit";
  state: VerificationState;
}

type RunMode = "loop" | "single";

function initializeRunSession(
  config: Config,
  options: RunOptions,
  engineOverride?: Engine,
): RunSession {
  const projectName = basename(process.cwd());
  const logFile = join(config.logDir, `ralph-${projectName}.log`);
  const progressFile = getProgressFile(projectName, config.progressDir);
  const model = getCurrentModel(config);
  const engine = initializeRalphEngine(
    config,
    (engineName, cliName) =>
      `'${engineName}' command not found. Please install ${cliName}.`,
    engineOverride,
  );

  initLogger({ logFile, verbose: options.verbose });
  initProgress(config.progressDir, progressFile);

  if (!engine) {
    process.exit(1);
  }

  return {
    projectName,
    logFile,
    progressFile,
    engine,
    testCmd: config.testCmd || detectTestCommand(),
    model,
  };
}

function logRunStartup(
  config: Config,
  session: RunSession,
  mode: RunMode,
): void {
  logSessionStart(session.projectName, config.engine, session.model);

  const modeLabel =
    mode === "single"
      ? "Single task mode"
      : config.maxIterations === -1
        ? "Infinite mode"
        : `Max ${config.maxIterations} iterations`;

  console.log(`Starting Ralph (${config.engine}) - ${modeLabel}`);
  console.log(`Using model: ${session.model}`);
  console.log(`Effort: ${getRalphEffort(config)}`);

  if (config.engine === "opencode" && config.ocFallModel) {
    console.log(`Fallback model: ${config.ocFallModel}`);
  }

  if (config.skipCommit) {
    console.log("Commits disabled for this run");
  }

  if (config.skipTestVerify) {
    console.log(pc.yellow("  Test verification DISABLED"));
    logWarning("Test verification disabled");
  } else if (session.testCmd) {
    console.log(`  Test command: ${session.testCmd}`);
    logInfo(`Test command: ${session.testCmd}`);
  } else {
    console.log(
      pc.yellow(
        "  No test command detected (configure test-cmd in ~/.sfk/config)",
      ),
    );
    logWarning("No test command detected");
  }

  console.log(`  Log file: ${session.logFile}`);
  console.log("");
}

function nextVerificationState(
  taskName: string,
  state: VerificationState,
): VerificationState {
  if (taskName !== state.lastFailedTask) {
    logInfo("Task changed, resetting failure counter");
    return {
      ...state,
      consecutiveFailures: 1,
      lastFailedTask: taskName,
    };
  }

  return {
    ...state,
    consecutiveFailures: state.consecutiveFailures + 1,
  };
}

function logTooManyVerificationFailures(
  taskName: string,
  logFile: string,
): void {
  logError(`Too many consecutive failures on task '${taskName}', stopping`);
  console.log(pc.red("  Too many consecutive failures on this task"));
  console.log(pc.red("  Manual intervention required"));
  console.log(`  Check log: ${logFile}`);
}

function handleVerificationResult(
  verification: ReturnType<typeof verify>,
  config: Config,
  progressFile: string,
  iteration: number,
  taskName: string,
  logFile: string,
  mode: RunMode,
  state: VerificationState,
): VerificationDecision {
  if (!verification.testsWritten) {
    if (mode === "single") {
      logWarning("No tests written, single task failed");
      appendFailure(
        progressFile,
        iteration,
        "No test files were created or modified",
        "You MUST write tests before the task can be completed",
      );
      return { status: "exit", state };
    }

    const nextState = nextVerificationState(taskName, state);
    logWarning(
      `No tests written, iteration failed (${nextState.consecutiveFailures}/${config.maxConsecutiveFailures})`,
    );

    appendFailure(
      progressFile,
      iteration,
      "No test files were created or modified",
      "You MUST write tests before the task can be completed",
    );

    if (nextState.consecutiveFailures >= config.maxConsecutiveFailures) {
      logTooManyVerificationFailures(taskName, logFile);
      return { status: "exit", state: nextState };
    }

    console.log(
      `  Verification failed (${nextState.consecutiveFailures}/${config.maxConsecutiveFailures})`,
    );
    console.log("  Continuing to next iteration to fix...");
    return { status: "retry", state: nextState };
  }

  if (!verification.testsPassed) {
    if (mode === "single") {
      logWarning("Tests failed, single task failed");
      appendFailure(
        progressFile,
        iteration,
        "Tests failed",
        "Fix the failing tests before marking the task complete",
      );
      return { status: "exit", state };
    }

    const nextState = nextVerificationState(taskName, state);
    logWarning(
      `Tests failed, iteration failed (${nextState.consecutiveFailures}/${config.maxConsecutiveFailures})`,
    );

    appendFailure(
      progressFile,
      iteration,
      "Tests failed",
      "Fix the failing tests before marking the task complete",
      verification.testOutput,
    );

    const retryState: VerificationState = {
      ...nextState,
      testFailureMode: true,
      lastTestOutput: verification.testOutput || "",
    };

    if (retryState.consecutiveFailures >= config.maxConsecutiveFailures) {
      logTooManyVerificationFailures(taskName, logFile);
      return { status: "exit", state: retryState };
    }

    console.log(
      `  Verification failed (${retryState.consecutiveFailures}/${config.maxConsecutiveFailures})`,
    );
    console.log("  Continuing to next iteration to fix...");
    console.log(
      pc.yellow("  Next iteration will use fix-tests prompt with test output"),
    );
    return { status: "retry", state: retryState };
  }

  logInfo("Verification passed");
  return {
    status: "passed",
    state: {
      consecutiveFailures: 0,
      lastFailedTask: "",
      testFailureMode: false,
      lastTestOutput: "",
    },
  };
}

async function handleRunRateLimit(
  engine: Engine,
  result: Pick<EngineResult, "hardRateLimited" | "softRateLimited">,
  softLimitRetries: number,
  config: Config,
): Promise<{
  action: "continue" | "retry" | "fallback" | "exit";
  softLimitRetries: number;
}> {
  return resolveRunRateLimitAction(engine, result, softLimitRetries, config);
}

export async function runLoop(
  config: Config,
  options: RunOptions,
): Promise<void> {
  const session = initializeRunSession(config, options);
  const { engine, logFile, progressFile, projectName, testCmd } = session;

  if (config.maxIterations < -1) {
    logError("Invalid maxIterations value; expected -1 or greater.");
    process.exit(1);
  }

  logRunStartup(config, session, "loop");

  const prompt = generatePrompt({
    skipCommit: config.skipCommit,
    progressFile,
  });

  let interrupted = false;
  const signalHandler = (signal: string) => {
    logWarning(`Received signal: ${signal}`);
    interrupted = true;
  };
  process.on("SIGINT", () => signalHandler("SIGINT"));
  process.on("SIGTERM", () => signalHandler("SIGTERM"));

  let iteration = 0;
  let softLimitRetries = 0;
  let verificationState: VerificationState = {
    consecutiveFailures: 0,
    lastFailedTask: "",
    testFailureMode: false,
    lastTestOutput: "",
  };

  while (config.maxIterations === -1 || iteration < config.maxIterations) {
    if (interrupted) {
      logWarning(`Interrupted at iteration ${iteration}`);
      console.log(pc.yellow("\n  Interrupted. Exiting gracefully."));
      process.exit(130);
    }

    iteration++;

    if (!existsSync(options.prdPath)) {
      logWarning(`${options.prdPath} not found, exiting`);
      console.log(pc.yellow(`  ${options.prdPath} not found. Exiting.`));
      process.exit(1);
    }

    const tasks = parsePrd(options.prdPath);
    const currentTask = getFirstIncompleteTask(tasks);
    const taskName = currentTask?.text || "unknown";

    if (allTasksComplete(tasks) && tasks.length > 0) {
      logSuccess("All tasks already complete!");
      console.log(pc.green("==========================================="));
      console.log(pc.green("  All tasks already complete!"));
      console.log(pc.green("==========================================="));

      try {
        unlinkSync(options.prdPath);
      } catch (err) {
        logWarning(`Failed to delete PRD file: ${err}`);
      }
      notify(`Ralph finished ${projectName} — all tasks already complete.`);
      process.exit(0);
    }

    const headBefore = getHeadSha();

    logIteration(iteration, config.maxIterations, taskName, engine.model);
    if (verificationState.testFailureMode) {
      console.log(pc.yellow("  Mode: FIX TESTS"));
    }

    const currentPrompt =
      verificationState.testFailureMode && verificationState.lastTestOutput
        ? generateFixTestsPrompt({
            testOutput: verificationState.lastTestOutput,
            skipCommit: config.skipCommit,
            progressFile,
          })
        : prompt;

    const result = await engine.run(currentPrompt);
    logAiOutput(result.output);
    console.log("");

    if (config.engine === "opencode") {
      const rateLimitResolution = await handleRunRateLimit(
        engine,
        result,
        softLimitRetries,
        config,
      );
      softLimitRetries = rateLimitResolution.softLimitRetries;

      if (
        rateLimitResolution.action === "retry" ||
        rateLimitResolution.action === "fallback"
      ) {
        iteration--;
        continue;
      }

      if (rateLimitResolution.action === "exit") {
        process.exit(1);
      }
    }

    if (!result.success) {
      logError(`${engine.name} failed with exit code ${result.exitCode}`);
      process.exit(result.exitCode);
    }

    if (!config.skipTestVerify && testCmd) {
      const verification = verify(testCmd);
      const decision = handleVerificationResult(
        verification,
        config,
        progressFile,
        iteration,
        taskName,
        logFile,
        "loop",
        verificationState,
      );
      verificationState = decision.state;

      if (decision.status === "exit") {
        process.exit(1);
      }

      if (decision.status === "retry") {
        await sleep(config.sleepSeconds);
        continue;
      }
    }

    if (config.pushAfterCommit && !config.skipCommit && headBefore) {
      pushAfterCommit(headBefore);
    }

    if (result.output.includes(COMPLETE_MARKER)) {
      const finalTasks = parsePrd(options.prdPath);
      const remainingCount = countIncompleteTasks(finalTasks);

      if (remainingCount > 0) {
        logWarning(`AI claimed complete but ${remainingCount} tasks remain`);
        console.log("");
        console.log(pc.yellow("==========================================="));
        console.log(
          pc.yellow(`  AI claimed complete but ${remainingCount} tasks remain`),
        );
        console.log(pc.yellow("  Continuing to next iteration..."));
        console.log(pc.yellow("==========================================="));
        await sleep(config.sleepSeconds);
        continue;
      }

      if (!config.skipTestVerify && testCmd) {
        console.log("");
        console.log("  Final verification: running full test suite...");
        const finalVerification = verify(testCmd);

        if (!finalVerification.testsPassed) {
          logError("Final verification failed");
          console.log("");
          console.log(pc.red("==========================================="));
          console.log(pc.red("  Final tests failed!"));
          console.log(pc.red("  Continuing to fix..."));
          console.log(pc.red("==========================================="));
          await sleep(config.sleepSeconds);
          continue;
        }
      }

      logSuccess("All tasks completed successfully!");
      console.log(pc.green("==========================================="));
      console.log(
        pc.green(`  All tasks complete after ${iteration} iterations!`),
      );
      console.log(pc.green("  All tests passing!"));
      console.log(`  Log: ${logFile}`);
      console.log(pc.green("==========================================="));

      try {
        unlinkSync(options.prdPath);
      } catch (err) {
        logWarning(`Failed to delete PRD file: ${err}`);
      }
      notify(
        `Ralph finished ${projectName} — all tasks complete after ${iteration} iterations. All tests passing.`,
      );

      if (config.auditAfterComplete) {
        console.log("");
        console.log(pc.cyan("  Starting willie audit loop..."));
        const { auditLoop } = await import("./audit.js");
        await auditLoop(config, {
          startStep: "audit",
          maxIterations: config.willieMaxIterations,
          auditPromptPath: config.willieAuditPrompt,
          lintCmd: config.lintCmd,
          verbose: options.verbose,
        });
      }

      process.exit(0);
    }

    await sleep(config.sleepSeconds);
  }

  logWarning(`Reached max iterations (${config.maxIterations})`);
  console.log(pc.yellow("==========================================="));
  console.log(pc.yellow(`  Reached max iterations (${config.maxIterations})`));
  console.log(`  Log: ${logFile}`);
  console.log(pc.yellow("==========================================="));

  notify(
    `Ralph hit max iterations (${config.maxIterations}) on ${projectName} — tasks remain incomplete.`,
  );

  process.exit(1);
}

export async function runSingleTask(
  config: Config,
  options: RunOptions,
  task: string,
  engineOverride?: Engine,
): Promise<void> {
  const session = initializeRunSession(config, options, engineOverride);
  const { engine, logFile, progressFile, testCmd } = session;
  logRunStartup(config, session, "single");

  const prompt = generateSingleTaskPrompt(task, {
    skipCommit: config.skipCommit,
    progressFile,
  });

  logIteration(1, 1, task, engine.model);

  let result = await engine.run(prompt);
  logAiOutput(result.output);
  console.log("");

  if (
    config.engine === "opencode" &&
    (result.hardRateLimited || result.softRateLimited)
  ) {
    let softRetries = 0;

    while (result.softRateLimited || result.hardRateLimited) {
      const rateLimitResolution = await handleRunRateLimit(
        engine,
        result,
        softRetries,
        config,
      );
      softRetries = rateLimitResolution.softLimitRetries;

      if (rateLimitResolution.action === "exit") {
        process.exit(1);
      }

      if (rateLimitResolution.action === "continue") {
        break;
      }

      result = await engine.run(prompt);
      logAiOutput(result.output);
      console.log("");
    }
  }

  if (!result.success) {
    logError(`${engine.name} failed with exit code ${result.exitCode}`);
    process.exit(result.exitCode);
  }

  if (!config.skipTestVerify && testCmd) {
    const verification = verify(testCmd);
    const decision = handleVerificationResult(
      verification,
      config,
      progressFile,
      1,
      task,
      logFile,
      "single",
      {
        consecutiveFailures: 0,
        lastFailedTask: "",
        testFailureMode: false,
        lastTestOutput: "",
      },
    );

    if (decision.status !== "passed") {
      process.exit(1);
    }
  }

  logSuccess("Single task completed successfully!");
  console.log(pc.green("==========================================="));
  console.log(pc.green("  Single task iteration complete"));
  console.log(pc.green("  All tests passing!"));
  console.log(`  Log: ${logFile}`);
  console.log(pc.green("==========================================="));
}
