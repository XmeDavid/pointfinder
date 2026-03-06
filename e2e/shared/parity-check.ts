#!/usr/bin/env npx tsx
/**
 * Parity check: verify that every scenario marked as required in scenarios.json
 * has a corresponding test file with the matching @scenarios tag.
 *
 * Usage: npx tsx shared/parity-check.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Scenario {
  id: string;
  name: string;
  api: boolean;
  web: boolean;
  mobile: boolean;
}

interface ScenariosFile {
  scenarios: Scenario[];
}

type Layer = 'api' | 'web' | 'mobile';

interface CoverageResult {
  scenarioId: string;
  scenarioName: string;
  layer: Layer;
  covered: boolean;
  files: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const E2E_ROOT = path.resolve(__dirname, '..');

function readScenariosJson(): Scenario[] {
  const filePath = path.join(E2E_ROOT, 'scenarios.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed: ScenariosFile = JSON.parse(raw);
  return parsed.scenarios;
}

/** Recursively collect all files matching the given extension under a directory. */
function collectFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract scenario IDs from a file's @scenarios tag line.
 * Supports both `// @scenarios ...` (TypeScript) and `# @scenarios ...` (YAML).
 */
function extractScenarioIds(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Match the first line that contains @scenarios (could be TS comment or YAML comment)
  const match = content.match(/(?:\/\/|#)\s*@scenarios\s+([^\n]+)/);
  if (!match) return [];
  // Split by comma and/or whitespace, filter empty strings
  return match[1]
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Build a map of scenarioId -> list of file paths that cover it, for a given layer. */
function buildCoverageMap(files: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const file of files) {
    const ids = extractScenarioIds(file);
    for (const id of ids) {
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(file);
    }
  }
  return map;
}

/** Return a path relative to e2e root for display purposes. */
function rel(filePath: string): string {
  return path.relative(E2E_ROOT, filePath);
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

const COL_ID   = 6;
const COL_NAME = 42;
const COL_LAYER = 8;
const COL_STATUS = 10;
const COL_FILES = 0; // variable width

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function printHeader(): void {
  const h =
    pad('ID', COL_ID) +
    pad('Scenario', COL_NAME) +
    pad('Layer', COL_LAYER) +
    pad('Status', COL_STATUS) +
    'Files';
  console.log(h);
  console.log('-'.repeat(h.length + 20));
}

function printRow(r: CoverageResult): void {
  const status = r.covered ? 'COVERED' : 'MISSING';
  const files  = r.covered ? r.files.map(rel).join(', ') : '(none)';
  const line =
    pad(r.scenarioId, COL_ID) +
    pad(r.scenarioName.length > COL_NAME - 2 ? r.scenarioName.slice(0, COL_NAME - 5) + '...' : r.scenarioName, COL_NAME) +
    pad(r.layer, COL_LAYER) +
    pad(status, COL_STATUS) +
    files;
  console.log(line);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const scenarios = readScenariosJson();

  // Collect test files per layer
  const apiFiles    = collectFiles(path.join(E2E_ROOT, 'api'),    '.spec.ts');
  const webFiles    = collectFiles(path.join(E2E_ROOT, 'web'),    '.spec.ts');
  const mobileFiles = collectFiles(path.join(E2E_ROOT, 'mobile'), '.yaml');

  // Build coverage maps
  const apiCoverage    = buildCoverageMap(apiFiles);
  const webCoverage    = buildCoverageMap(webFiles);
  const mobileCoverage = buildCoverageMap(mobileFiles);

  // Evaluate each required scenario+layer combo
  const results: CoverageResult[] = [];

  for (const scenario of scenarios) {
    const layers: Array<{ layer: Layer; required: boolean; map: Map<string, string[]> }> = [
      { layer: 'api',    required: scenario.api,    map: apiCoverage    },
      { layer: 'web',    required: scenario.web,    map: webCoverage    },
      { layer: 'mobile', required: scenario.mobile, map: mobileCoverage },
    ];

    for (const { layer, required, map } of layers) {
      if (!required) continue;
      const files = map.get(scenario.id) ?? [];
      results.push({
        scenarioId:   scenario.id,
        scenarioName: scenario.name,
        layer,
        covered:      files.length > 0,
        files,
      });
    }
  }

  // Print table
  console.log('\nE2E Scenario Parity Check\n');
  printHeader();

  const missing = results.filter((r) => !r.covered);
  const covered = results.filter((r) =>  r.covered);

  for (const r of results) printRow(r);

  // Summary
  console.log('');
  console.log(`Total required:  ${results.length}`);
  console.log(`Covered:         ${covered.length}`);
  console.log(`Missing:         ${missing.length}`);

  if (missing.length > 0) {
    console.log('\nMissing coverage:');
    for (const r of missing) {
      console.log(`  [${r.layer.toUpperCase()}] ${r.scenarioId} - ${r.scenarioName}`);
    }
    console.log('');
    process.exit(1);
  }

  console.log('\nAll required scenarios are covered.\n');
  process.exit(0);
}

main();
