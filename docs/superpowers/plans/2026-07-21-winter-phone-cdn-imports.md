# 寒冬小手机 CDN Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将末世寒冬角色卡内七个小手机脚本全部改为固定 `@20260211` 分支的 `testingcf.jsdelivr.net` CDN import。

**Architecture:** 为 `PHONE_SCRIPT_DEFINITIONS` 直接保存完整 CDN URL，由原子 PNG 打包器按稳定 ID 幂等写入。测试解码临时和最终 PNG，拒绝 localhost、缺少 `@20260211` 或脚本重复。

**Tech Stack:** Node.js ESM、PNG `tEXt/chara` 元数据、Tavern Helper 脚本清单、`node:assert`。

## Global Constraints

- 所有小手机 CDN URL 必须以 `https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/` 开头。
- 六个平台脚本使用 `小手机平台/脚本/<同名目录>/index.js`。
- 寒冬适配器使用 `寒冬末日/脚本/小手机-90寒冬适配器/index.js`。
- 七个脚本的名称、ID、顺序和 `enabled: true` 不变。
- 自动更新版本提升为 `1.0.3`。
- PNG 继续原子写入且重复打包字节幂等。

---

### Task 1: 将七个小手机脚本切换到固定分支 CDN

**Files:**
- Modify: `scripts/test-package-winter-phone-card.mjs`
- Modify: `scripts/package-winter-phone-card.mjs`
- Modify: `src/寒冬末日/自动更新角色卡版本.yaml`
- Modify atomically: `src/末世寒冬 - 星穹秩序.png`

**Interfaces:**
- Consumes: `PHONE_SCRIPT_DEFINITIONS` 和 `packageWinterPhoneCard({ input, worldbook, write })`。
- Produces: 每个元素含 `importUrl` 的 `PHONE_SCRIPT_DEFINITIONS`，以及无 localhost 小手机 import 的最终 PNG。

- [ ] **Step 1: 编写失败测试**

将现有 localhost 断言替换为七个精确 URL 断言：

```js
const CDN_ROOT =
  'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/';
assert.deepEqual(
  phoneScripts.map(script => script.content),
  PHONE_SCRIPT_DEFINITIONS.map(definition => `import\n'${CDN_ROOT}${definition.distPath}'`),
);
assert.ok(phoneScripts.every(script => !script.content.includes('localhost')));
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-package-winter-phone-card.mjs`  
Expected: FAIL，因为打包器仍生成 `http://localhost:5500/dist/...`。

- [ ] **Step 3: 实现 CDN import**

在 `scripts/package-winter-phone-card.mjs` 中增加：

```js
const PHONE_CDN_ROOT =
  'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/';
```

将 `buildPhoneScript` 的 `content` 改为：

```js
content: `import\n'${PHONE_CDN_ROOT}${definition.distPath}'`,
```

同时把 `info` 改为说明这是 `20260211` 分支 CDN 产物，不再声称是本地构建。

- [ ] **Step 4: 运行测试确认通过**

Run: `node scripts/test-package-winter-phone-card.mjs`  
Expected: PASS，七个脚本的名称、ID、URL、开关和幂等性全部通过。

- [ ] **Step 5: 更新版本和 PNG**

将版本文件改为：

```yaml
版本: 1.0.3
```

Run:

```powershell
node scripts/package-winter-phone-card.mjs --input 'src/末世寒冬 - 星穹秩序.png' --worldbook 'src/寒冬末日.json' --write
```

Expected: PNG 原子更新，七个小手机脚本均为 `@20260211` CDN import。

- [ ] **Step 6: 最终验证与提交**

Run:

```powershell
node scripts/test-package-winter-phone-card.mjs
pnpm exec eslint --no-ignore scripts/package-winter-phone-card.mjs scripts/test-package-winter-phone-card.mjs
git diff --check
```

Expected: 全部成功。

Commit:

```powershell
git add -- 'scripts/package-winter-phone-card.mjs' 'scripts/test-package-winter-phone-card.mjs' 'src/寒冬末日/自动更新角色卡版本.yaml' 'src/末世寒冬 - 星穹秩序.png'
git commit -m "feat(winter): load phone scripts from CDN"
```
