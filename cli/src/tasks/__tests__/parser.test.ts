import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allTasksComplete,
  countIncompleteTasks,
  getFirstIncompleteTask,
  getTaskSummary,
  markTaskComplete,
  parsePrd,
  type Task,
} from "../parser.js";

describe("tasks/parser", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ralph-parser-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("parsePrd", () => {
    test("returns empty array for non-existent file", () => {
      const tasks = parsePrd(join(tempDir, "nonexistent.md"));
      expect(tasks).toEqual([]);
    });

    test("parses incomplete tasks with [ ]", () => {
      const prdPath = join(tempDir, "PRD.md");
      writeFileSync(prdPath, "- [ ] First task\n- [ ] Second task");

      const tasks = parsePrd(prdPath);
      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toEqual({
        text: "First task",
        completed: false,
        lineNumber: 0,
      });
      expect(tasks[1]).toEqual({
        text: "Second task",
        completed: false,
        lineNumber: 1,
      });
    });

    test("parses completed tasks with [x]", () => {
      const prdPath = join(tempDir, "PRD.md");
      writeFileSync(prdPath, "- [x] Done task\n- [X] Also done");

      const tasks = parsePrd(prdPath);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].completed).toBe(true);
      expect(tasks[1].completed).toBe(true);
    });

    test("parses mixed completed and incomplete tasks", () => {
      const prdPath = join(tempDir, "PRD.md");
      writeFileSync(prdPath, "- [x] Done\n- [ ] Not done\n- [x] Also done");

      const tasks = parsePrd(prdPath);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].completed).toBe(true);
      expect(tasks[1].completed).toBe(false);
      expect(tasks[2].completed).toBe(true);
    });

    test("handles indented tasks", () => {
      const prdPath = join(tempDir, "PRD.md");
      writeFileSync(prdPath, "  - [ ] Indented task\n    - [ ] More indented");

      const tasks = parsePrd(prdPath);
      expect(tasks).toHaveLength(2);
      expect(tasks[0].text).toBe("Indented task");
      expect(tasks[1].text).toBe("More indented");
    });

    test("ignores non-task lines", () => {
      const prdPath = join(tempDir, "PRD.md");
      writeFileSync(
        prdPath,
        "# Header\n\nSome text\n\n- [ ] Actual task\n\n- Regular bullet",
      );

      const tasks = parsePrd(prdPath);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe("Actual task");
    });

    test("preserves correct line numbers", () => {
      const prdPath = join(tempDir, "PRD.md");
      writeFileSync(
        prdPath,
        "# Header\n\n- [ ] Task on line 2\n\n- [ ] Task on line 4",
      );

      const tasks = parsePrd(prdPath);
      expect(tasks[0].lineNumber).toBe(2);
      expect(tasks[1].lineNumber).toBe(4);
    });
  });

  describe("getFirstIncompleteTask", () => {
    test("returns undefined for empty array", () => {
      expect(getFirstIncompleteTask([])).toBeUndefined();
    });

    test("returns undefined when all tasks complete", () => {
      const tasks: Task[] = [
        { text: "Done", completed: true, lineNumber: 0 },
        { text: "Also done", completed: true, lineNumber: 1 },
      ];
      expect(getFirstIncompleteTask(tasks)).toBeUndefined();
    });

    test("returns first incomplete task", () => {
      const tasks: Task[] = [
        { text: "Done", completed: true, lineNumber: 0 },
        { text: "Not done", completed: false, lineNumber: 1 },
        { text: "Also not done", completed: false, lineNumber: 2 },
      ];
      const result = getFirstIncompleteTask(tasks);
      expect(result?.text).toBe("Not done");
      expect(result?.lineNumber).toBe(1);
    });
  });

  describe("countIncompleteTasks", () => {
    test("returns 0 for empty array", () => {
      expect(countIncompleteTasks([])).toBe(0);
    });

    test("returns correct count", () => {
      const tasks: Task[] = [
        { text: "Done", completed: true, lineNumber: 0 },
        { text: "Not done", completed: false, lineNumber: 1 },
        { text: "Also not done", completed: false, lineNumber: 2 },
      ];
      expect(countIncompleteTasks(tasks)).toBe(2);
    });

    test("returns 0 when all complete", () => {
      const tasks: Task[] = [
        { text: "Done", completed: true, lineNumber: 0 },
        { text: "Also done", completed: true, lineNumber: 1 },
      ];
      expect(countIncompleteTasks(tasks)).toBe(0);
    });
  });

  describe("allTasksComplete", () => {
    test("returns false for empty array", () => {
      expect(allTasksComplete([])).toBe(false);
    });

    test("returns true when all complete", () => {
      const tasks: Task[] = [
        { text: "Done", completed: true, lineNumber: 0 },
        { text: "Also done", completed: true, lineNumber: 1 },
      ];
      expect(allTasksComplete(tasks)).toBe(true);
    });

    test("returns false when any incomplete", () => {
      const tasks: Task[] = [
        { text: "Done", completed: true, lineNumber: 0 },
        { text: "Not done", completed: false, lineNumber: 1 },
      ];
      expect(allTasksComplete(tasks)).toBe(false);
    });
  });

  describe("markTaskComplete", () => {
    test("does nothing for non-existent file", () => {
      const task: Task = { text: "Test", completed: false, lineNumber: 0 };
      // Should not throw
      markTaskComplete(join(tempDir, "nonexistent.md"), task);
    });

    test("marks task complete in file", () => {
      const prdPath = join(tempDir, "PRD.md");
      writeFileSync(prdPath, "- [ ] First task\n- [ ] Second task");

      const task: Task = {
        text: "First task",
        completed: false,
        lineNumber: 0,
      };
      markTaskComplete(prdPath, task);

      const content = readFileSync(prdPath, "utf-8");
      expect(content).toBe("- [x] First task\n- [ ] Second task");
    });

    test("marks correct task when multiple exist", () => {
      const prdPath = join(tempDir, "PRD.md");
      writeFileSync(prdPath, "- [ ] First\n- [ ] Second\n- [ ] Third");

      const task: Task = { text: "Second", completed: false, lineNumber: 1 };
      markTaskComplete(prdPath, task);

      const content = readFileSync(prdPath, "utf-8");
      expect(content).toBe("- [ ] First\n- [x] Second\n- [ ] Third");
    });
  });

  describe("getTaskSummary", () => {
    test("returns correct summary for mixed tasks", () => {
      const tasks: Task[] = [
        { text: "Done", completed: true, lineNumber: 0 },
        { text: "Not done", completed: false, lineNumber: 1 },
        { text: "Also not done", completed: false, lineNumber: 2 },
      ];
      expect(getTaskSummary(tasks)).toBe("1/3 tasks complete (2 remaining)");
    });

    test("returns correct summary for all complete", () => {
      const tasks: Task[] = [
        { text: "Done", completed: true, lineNumber: 0 },
        { text: "Also done", completed: true, lineNumber: 1 },
      ];
      expect(getTaskSummary(tasks)).toBe("2/2 tasks complete (0 remaining)");
    });

    test("returns correct summary for none complete", () => {
      const tasks: Task[] = [
        { text: "Not done", completed: false, lineNumber: 0 },
        { text: "Also not done", completed: false, lineNumber: 1 },
      ];
      expect(getTaskSummary(tasks)).toBe("0/2 tasks complete (2 remaining)");
    });
  });
});
