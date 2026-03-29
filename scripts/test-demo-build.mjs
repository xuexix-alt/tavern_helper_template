import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const demoRoot = path.resolve('src/demo');
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.vue', '.json'];
const importPattern = /^\s*import(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;
const projectRoot = process.cwd();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function walkFiles(rootDir) {
  const results = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
      continue;
    }

    if (/\.(ts|tsx|js|jsx|vue)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

function collectImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = [];

  for (const match of content.matchAll(importPattern)) {
    imports.push(match[1]);
  }

  return imports;
}

function resolveImport(sourceFile, request) {
  const basePath = path.resolve(path.dirname(sourceFile), request);

  const candidates = [];
  if (path.extname(basePath)) {
    candidates.push(basePath);
  } else {
    candidates.push(basePath, ...sourceExtensions.map(ext => `${basePath}${ext}`));
    for (const ext of sourceExtensions) {
      candidates.push(path.join(basePath, `index${ext}`));
    }
  }

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

function main() {
  if (!fs.existsSync(demoRoot)) {
    throw new Error(`目录不存在: ${demoRoot}`);
  }

  const files = walkFiles(demoRoot);
  const missingImports = [];

  for (const filePath of files) {
    const imports = collectImports(filePath);

    for (const request of imports) {
      if (!request.startsWith('.')) {
        continue;
      }

      const resolved = resolveImport(filePath, request);
      if (!resolved) {
        missingImports.push({
          filePath: path.relative(process.cwd(), filePath),
          request,
        });
      }
    }
  }

  if (missingImports.length > 0) {
    for (const { filePath, request } of missingImports) {
      console.error(`[demo-check] unresolved import: ${filePath} -> ${request}`);
    }
    process.exitCode = 1;
    return;
  }

  const demoSchema = fs.readFileSync(path.join(demoRoot, 'schema.ts'), 'utf8');
  assert(
    demoSchema.includes("../寒冬末日/schema"),
    'src/demo/schema.ts 必须复用 src/寒冬末日/schema.ts，而不是维护独立空 schema',
  );

  const demoStore = fs.readFileSync(path.join(demoRoot, '界面/状态栏/store.ts'), 'utf8');
  assert(
    demoStore.includes("from '../../schema'"),
    "src/demo/界面/状态栏/store.ts 应通过 demo/schema.ts 间接复用寒冬末日 schema",
  );

  const demoRegisterScript = fs.readFileSync(path.join(demoRoot, '脚本/变量结构/index.ts'), 'utf8');
  assert(
    demoRegisterScript.includes("from '../../schema'"),
    "src/demo/脚本/变量结构/index.ts 应通过 demo/schema.ts 注册复用后的 schema",
  );

  const demoIndex = YAML.parse(fs.readFileSync(path.join(demoRoot, 'index.yaml'), 'utf8'));
  const entries = demoIndex?.条目?.[0]?.条目 ?? [];

  const expectedFilesByName = new Map([
    ['变量列表', '../寒冬末日/世界书/变量/变量列表.txt'],
    ['[mvu_update]变量更新规则', '../寒冬末日/世界书/变量/[mvu_update]变量更新规则'],
    ['[mvu_update]变量输出格式', '../寒冬末日/世界书/变量/[mvu_update]变量输出格式'],
  ]);

  for (const [entryName, expectedFile] of expectedFilesByName.entries()) {
    const entry = entries.find(item => item?.名称 === entryName);
    assert(entry, `src/demo/index.yaml 缺少条目: ${entryName}`);
    assert(
      entry.文件 === expectedFile,
      `src/demo/index.yaml 中 '${entryName}' 应直接复用 ${expectedFile}，当前为 ${String(entry.文件)}`,
    );
  }

  console.log(`[demo-check] passed (${files.length} files scanned)`);
  console.log(`[demo-check] verified source-of-truth reuse under ${path.relative(projectRoot, demoRoot)}`);
}

main();
