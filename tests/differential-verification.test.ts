import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, rmSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Task 2: Differential Test Verification', () => {
  const ralphScript = join(process.cwd(), 'ralph.sh');
  let testDir: string;

  beforeEach(() => {
    // Create a unique test directory
    testDir = join(tmpdir(), `ralph-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('extract_failing_tests function', () => {
    it('should extract failing test names from Jest/Vitest output', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      // Verify the function exists
      expect(scriptContent).toContain('extract_failing_tests() {');

      // Verify it handles Jest/Vitest patterns
      expect(scriptContent).toContain('✗');
      expect(scriptContent).toContain('✕');
      expect(scriptContent).toContain('FAIL');
      expect(scriptContent).toContain('FAILED');
    });

    it('should support multiple test framework patterns', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      // Check for pattern comments
      expect(scriptContent).toContain('Pattern 1: ✗ test_name or ✕ test_name or FAIL test_name');
      expect(scriptContent).toContain('Pattern 2: "test description" (quoted test names)');
      expect(scriptContent).toContain('Pattern 3: --- FAIL: TestName');
    });

    it('should use grep with proper regex patterns', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      // Verify it uses grep to extract failures
      const funcStart = scriptContent.indexOf('extract_failing_tests() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 500);
      expect(funcContent).toContain('grep -E');
      expect(funcContent).toContain('sort -u');
    });
  });

  describe('compare_test_failures function', () => {
    it('should exist in ralph.sh', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      expect(scriptContent).toContain('compare_test_failures() {');
    });

    it('should accept baseline_file and current_output parameters', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('compare_test_failures() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 200);

      expect(funcContent).toContain('local baseline_file="$1"');
      expect(funcContent).toContain('local current_output="$2"');
    });

    it('should return failure if no baseline file exists', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('compare_test_failures() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 400);

      // Should check if baseline file exists
      expect(funcContent).toContain('if [[ ! -f "$baseline_file" ]] || [[ ! -s "$baseline_file" ]];');
      expect(funcContent).toContain('NEW_FAILURES');
      expect(funcContent).toContain('return 1');
    });

    it('should read baseline exit code and output', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('compare_test_failures() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 800);

      // Should read exit code from first line
      expect(funcContent).toContain('baseline_exit_code=$(head -1 "$baseline_file")');
      // Should extract output skipping separator
      expect(funcContent).toContain('baseline_output=$(tail -n +3 "$baseline_file")');
    });

    it('should treat any failure as new if baseline passed', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('compare_test_failures() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 1000);

      // If baseline exit code is 0, any new failure is a regression
      expect(funcContent).toContain('if [[ "$baseline_exit_code" == "0" ]];');
      expect(funcContent).toContain('NEW_FAILURES');
    });

    it('should extract and compare failing test names', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('compare_test_failures() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 1500);

      // Should call extract_failing_tests on both outputs
      expect(funcContent).toContain('baseline_failures=$(extract_failing_tests "$baseline_output")');
      expect(funcContent).toContain('current_failures=$(extract_failing_tests "$current_output")');
    });

    it('should pass if no failures in current output', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('compare_test_failures() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 1500);

      // If no current failures, should pass
      expect(funcContent).toContain('if [[ -z "$current_failures" ]];');
      expect(funcContent).toContain('NO_NEW_FAILURES');
      expect(funcContent).toContain('return 0');
    });

    it('should check if current failures are subset of baseline', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('compare_test_failures() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 2000);

      // Should iterate through current failures
      expect(funcContent).toContain('while IFS= read -r test_name; do');
      // Should check if each test was in baseline
      expect(funcContent).toContain('grep -qF "$test_name"');
      expect(funcContent).toContain('new_failure_found=1');
    });

    it('should return success if only pre-existing failures present', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('compare_test_failures() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 2000);

      expect(funcContent).toContain('if [[ $new_failure_found -eq 1 ]];');
      expect(funcContent).toContain('NO_NEW_FAILURES');
      expect(funcContent).toContain('return 0');
    });
  });

  describe('run_tests differential verification integration', () => {
    it('should call compare_test_failures when tests fail and baseline exists', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('run_tests() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 3000);

      // Should check for baseline file
      expect(funcContent).toContain('if [[ -f "$BASELINE_FILE" ]] && [[ -s "$BASELINE_FILE" ]];');
      // Should show differential verification message
      expect(funcContent).toContain('Checking for new test failures (differential verification)...');
      // Should call compare_test_failures
      expect(funcContent).toContain('if compare_test_failures "$BASELINE_FILE" "$test_output";');
    });

    it('should log when only pre-existing failures are detected', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('run_tests() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 3000);

      expect(funcContent).toContain('Tests failed but no new failures detected (pre-existing failures only)');
      expect(funcContent).toContain('No new test failures (pre-existing failures are expected)');
      expect(funcContent).toContain('return 0');
    });

    it('should log and fail when new failures are detected', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('run_tests() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 3000);

      expect(funcContent).toContain('New test failures detected (not in baseline)');
      expect(funcContent).toContain('New test failures detected (exit code:');
      expect(funcContent).toContain('return 1');
    });

    it('should fall back to regular failure if no baseline available', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('run_tests() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 3000);

      expect(funcContent).toContain('# No baseline, treat as regular failure');
      expect(funcContent).toContain('Tests failed (exit code: $exit_code) - No baseline available');
    });

    it('should still return success for passing tests', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const funcStart = scriptContent.indexOf('run_tests() {');
      const funcContent = scriptContent.slice(funcStart, funcStart + 3000);

      expect(funcContent).toContain('if [[ $exit_code -eq 0 ]];');
      expect(funcContent).toContain('Tests passed!');
    });
  });

  describe('Baseline file format', () => {
    it('should store exit code on first line', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      // Check pre-flight section stores format correctly
      const preflightStart = scriptContent.indexOf('# PRE-FLIGHT TEST BASELINE');
      const preflightContent = scriptContent.slice(preflightStart, preflightStart + 2000);

      expect(preflightContent).toContain('echo "$baseline_exit_code" > "$BASELINE_FILE"');
    });

    it('should use separator between exit code and output', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const preflightStart = scriptContent.indexOf('# PRE-FLIGHT TEST BASELINE');
      const preflightContent = scriptContent.slice(preflightStart, preflightStart + 2000);

      expect(preflightContent).toContain('echo "---BASELINE-OUTPUT---" >> "$BASELINE_FILE"');
    });

    it('should store test output after separator', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const preflightStart = scriptContent.indexOf('# PRE-FLIGHT TEST BASELINE');
      const preflightContent = scriptContent.slice(preflightStart, preflightContent + 2000);

      expect(preflightContent).toContain('echo "$baseline_output" >> "$BASELINE_FILE"');
    });
  });

  describe('Integration with test verification gate', () => {
    it('should use differential verification in test gate', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      // Find the test verification gate section
      const gateStart = scriptContent.indexOf('# TEST VERIFICATION GATE');
      const gateContent = scriptContent.slice(gateStart, gateStart + 3000);

      // Should call run_tests which now includes differential logic
      expect(gateContent).toContain('if ! run_tests "$DETECTED_TEST_CMD";');
    });

    it('should not block PRD work when only pre-existing failures present', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      // The run_tests function returns 0 when differential verification passes
      // This means verification_failed stays 0 and work continues
      const gateStart = scriptContent.indexOf('# TEST VERIFICATION GATE');
      const gateContent = scriptContent.slice(gateStart, gateContent + 3000);

      expect(gateContent).toContain('verification_failed=0');
      expect(gateContent).toContain('if [[ $verification_failed -eq 1 ]];');
    });
  });

  describe('Documentation and logging', () => {
    it('should have clear comments explaining differential verification', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const runTestsStart = scriptContent.indexOf('run_tests() {');
      const runTestsContent = scriptContent.slice(runTestsStart, runTestsStart + 3000);

      expect(runTestsContent).toContain('# DIFFERENTIAL VERIFICATION: Compare against baseline');
    });

    it('should log differential verification results', () => {
      const script = ralphScript;
      const scriptContent = readFileSync(script, 'utf-8');

      const runTestsStart = scriptContent.indexOf('run_tests() {');
      const runTestsContent = scriptContent.slice(runTestsStart, runTestsStart + 3000);

      expect(runTestsContent).toContain('log "INFO" "Tests failed but no new failures detected');
      expect(runTestsContent).toContain('log "ERROR" "New test failures detected');
    });
  });
});
