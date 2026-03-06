import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const COMPONENT_DIRS = [
  'src/寒冬末日/界面/状态栏/components',
  'src/寒冬末日/界面纯UI版/状态栏/components',
];

const HARD_CODED_COLOR_RE = /#(?:[0-9a-fA-F]{3,8})\b|rgba?\(|hsla?\(/;
const VAR_FALLBACK_COLOR_RE = /var\([^)]+,\s*(?:rgba?\(|hsla?\(|#)/;

/**
 * @param {string} dir
 * @returns {string[]}
 */
function collectVueFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectVueFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith('.vue')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * @param {string} filePath
 * @returns {Array<{ type: string; line: number; text: string }>}
 */
function scanFile(filePath) {
  const findings = [];
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    if (VAR_FALLBACK_COLOR_RE.test(line)) {
      findings.push({
        type: 'fallback-color',
        line: index + 1,
        text: line.trim(),
      });
      return;
    }
    if (HARD_CODED_COLOR_RE.test(line)) {
      findings.push({
        type: 'hardcoded-color',
        line: index + 1,
        text: line.trim(),
      });
    }
  });

  return findings;
}

/** @type {Array<{ file: string; type: string; line: number; text: string }>} */
const allFindings = [];

for (const componentDir of COMPONENT_DIRS) {
  const absDir = path.resolve(ROOT_DIR, componentDir);
  for (const filePath of collectVueFiles(absDir)) {
    const relativePath = path.relative(ROOT_DIR, filePath).replaceAll(path.sep, '/');
    const findings = scanFile(filePath);
    for (const finding of findings) {
      allFindings.push({
        file: relativePath,
        type: finding.type,
        line: finding.line,
        text: finding.text,
      });
    }
  }
}

if (allFindings.length === 0) {
  console.log('component-token-check: PASS (0 findings)');
  process.exit(0);
}

console.error(`component-token-check: FAIL (${allFindings.length} findings)`);
for (const finding of allFindings) {
  console.error(`${finding.file}:${finding.line} [${finding.type}] ${finding.text}`);
}
process.exit(1);
