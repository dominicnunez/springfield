import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Task 2: Differential test verification", () => {
  const ralphPath = join(import.meta.dir, "..", "ralph.sh");
  const content = readFileSync(ralphPath, "utf-8");

  describe("Code structure", () => {
    test("has DIFFERENTIAL TEST VERIFICATION section comment", () => {
      expect(content).toContain("# DIFFERENTIAL TEST VERIFICATION");
    });

    test("defines extract_failing_tests function", () => {
      expect(content).toContain("extract_failing_tests() {");
    });

    test("defines compare_test_failures function", () => {
      expect(content).toContain("compare_test_failures() {");
    });
  });

  describe("extract_failing_tests function", () => {
    test("extracts test names using grep patterns", () => {
      expect(content).toContain("extract_failing_tests() {");
      const funcStart = content.indexOf("extract_failing_tests() {");
      const funcSection = content.slice(funcStart, funcStart + 800);

      expect(funcSection).toContain("grep -E");
      expect(funcSection).toMatch(/(FAIL|Error|✗|✕)/);
      expect(funcSection).toContain("grep -oE");
      expect(funcSection).toContain("sort -u");
      expect(funcSection).toContain("|| true");
    });
  });

  describe("compare_test_failures function", () => {
    const funcStart = content.indexOf("compare_test_failures() {");
    const funcEnd = content.indexOf("\nget_current_task() {", funcStart);
    const compareFunc = content.slice(funcStart, funcEnd);

    test("accepts baseline_file and current_output parameters", () => {
      expect(compareFunc).toContain("baseline_file");
      expect(compareFunc).toContain("current_output");
    });

    test("handles missing or empty baseline file", () => {
      expect(compareFunc).toMatch(/if \[\[ ! -f.*baseline_file.*\]\]/);
      expect(compareFunc).toMatch(/\[\[ ! -s.*baseline_file.*\]\]/);
    });

    test("reads baseline exit code from first line", () => {
      expect(compareFunc).toContain("baseline_exit_code=$(head -1");
    });

    test("extracts baseline output after separator line", () => {
      expect(compareFunc).toContain("tail -n +3");
    });

    test("treats any failure as new when baseline passed", () => {
      expect(compareFunc).toMatch(/if \[\[.*baseline_exit_code.*==.*"0"/);
    });

    test("calls extract_failing_tests on both outputs", () => {
      expect(compareFunc).toContain("baseline_failures=$(extract_failing_tests");
      expect(compareFunc).toContain("current_failures=$(extract_failing_tests");
    });

    test("returns success when no current failures detected", () => {
      expect(compareFunc).toMatch(/if \[\[ -z.*current_failures.*\]\]/);
    });

    test("compares current failures against baseline", () => {
      expect(compareFunc).toContain("grep -qF");
      expect(compareFunc).toContain("baseline_failures");
    });

    test("detects new failures not in baseline", () => {
      expect(compareFunc).toContain("new_failure_found");
    });

    test("returns appropriate exit codes", () => {
      expect(compareFunc).toContain("return 0");
      expect(compareFunc).toContain("return 1");
    });
  });

  describe("run_tests integration", () => {
    const funcStart = content.indexOf("run_tests() {");
    const funcEnd = content.indexOf("\n\n# ─", funcStart);
    const runTestsFunc = content.slice(funcStart, funcEnd);

    test("checks for BASELINE_FILE existence", () => {
      expect(runTestsFunc).toMatch(/if \[\[ -f "\$BASELINE_FILE" \]\]/);
    });

    test("checks if BASELINE_FILE is not empty", () => {
      expect(runTestsFunc).toMatch(/\[\[ -s "\$BASELINE_FILE" \]\]/);
    });

    test("calls compare_test_failures with correct parameters", () => {
      expect(runTestsFunc).toContain('compare_test_failures "$BASELINE_FILE" "$test_output"');
    });

    test("logs differential verification message", () => {
      expect(runTestsFunc).toContain("differential verification");
    });

    test("returns success when no new failures detected", () => {
      expect(runTestsFunc).toContain("No new test failures");
    });

    test("returns failure when new failures detected", () => {
      expect(runTestsFunc).toContain("New test failures detected");
    });

    test("falls back to regular failure when no baseline exists", () => {
      expect(runTestsFunc).toContain("else");
      expect(runTestsFunc).toMatch(/Tests failed \(exit code/);
    });
  });

  describe("Differential verification flow", () => {
    test("pre-flight baseline creates BASELINE_FILE", () => {
      expect(content).toContain("BASELINE_FILE=$(mktemp)");
    });

    test("BASELINE_FILE is cleaned up on exit", () => {
      expect(content).toContain('trap "rm -f $BASELINE_FILE" EXIT');
    });

    test("baseline stores exit code on first line", () => {
      expect(content).toContain('echo "$baseline_exit_code" > "$BASELINE_FILE"');
    });

    test("baseline stores separator line", () => {
      expect(content).toContain('echo "---BASELINE-OUTPUT---" >> "$BASELINE_FILE"');
    });

    test("baseline stores test output", () => {
      expect(content).toContain('echo "$baseline_output" >> "$BASELINE_FILE"');
    });

    test("logs pre-existing failures to progress file", () => {
      const preflightSection = content.slice(
        content.indexOf("# PRE-FLIGHT TEST BASELINE"),
        content.indexOf("while [[ \"$MAX\" -eq -1 ]]")
      );
      expect(preflightSection).toContain("Pre-flight Test Baseline");
      expect(preflightSection).toContain("differential verification enabled");
    });
  });

  describe("Test output parsing", () => {
    test("extract_failing_tests supports common test frameworks", () => {
      const extractStart = content.indexOf("extract_failing_tests() {");
      const extractFunc = content.slice(extractStart, extractStart + 600);

      // Check for comments mentioning framework support
      expect(extractFunc).toMatch(/Jest|Vitest|pytest|Go|Mocha/i);
    });

    test("compare_test_failures uses fixed string matching", () => {
      const compareStart = content.indexOf("compare_test_failures() {");
      const compareFunc = content.slice(compareStart, compareStart + 1500);

      // grep -qF uses fixed string matching (not regex)
      expect(compareFunc).toContain("grep -qF");
    });
  });

  describe("Edge cases", () => {
    test("handles case where baseline failed but current passes", () => {
      const compareStart = content.indexOf("compare_test_failures() {");
      const compareFunc = content.slice(compareStart, compareStart + 1500);

      // If current_failures is empty, should pass
      expect(compareFunc).toMatch(/if \[\[ -z.*current_failures.*\]\]/);
      expect(compareFunc).toContain("NO_NEW_FAILURES");
    });

    test("handles case where baseline passed but current fails", () => {
      const compareStart = content.indexOf("compare_test_failures() {");
      const compareFunc = content.slice(compareStart, compareStart + 1500);

      // If baseline_exit_code is 0, any failure is new
      expect(compareFunc).toMatch(/if \[\[.*baseline_exit_code.*==.*"0"/);
      expect(compareFunc).toContain("NEW_FAILURES");
    });
  });

  describe("Logging and output", () => {
    test("run_tests logs info when no new failures", () => {
      const runTestsStart = content.indexOf("run_tests() {");
      const runTestsFunc = content.slice(runTestsStart, runTestsStart + 1500);

      expect(runTestsFunc).toContain('log "INFO"');
      expect(runTestsFunc).toContain("pre-existing failures");
    });

    test("run_tests logs error when new failures detected", () => {
      const runTestsStart = content.indexOf("run_tests() {");
      const runTestsFunc = content.slice(runTestsStart, runTestsStart + 1500);

      expect(runTestsFunc).toContain('log "ERROR"');
      expect(runTestsFunc).toContain("New test failures");
    });

    test("displays user-friendly messages", () => {
      const runTestsStart = content.indexOf("run_tests() {");
      const runTestsFunc = content.slice(runTestsStart, runTestsStart + 1500);

      expect(runTestsFunc).toMatch(/echo.*No new test failures/);
      expect(runTestsFunc).toMatch(/echo.*New test failures detected/);
    });
  });
});
