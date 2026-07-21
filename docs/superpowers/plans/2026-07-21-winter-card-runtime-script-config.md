# 末世寒冬角色卡运行脚本配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将末世寒冬角色卡的正式 Zod 定义、后台数据维护和自动更新脚本固定到 `20260211` CDN 并启用，关闭本地变量结构测试脚本。

**Architecture:** 扩展现有原子 PNG 打包器，按稳定 ID 和名称幂等更新基础运行脚本，再继续打包七个小手机脚本。最终 PNG 与版本清单同步更新，而其他内嵌脚本保持不变。

**Tech Stack:** Node.js ESM、PNG `tEXt/chara` 角色卡元数据、Tavern Helper 脚本清单、`node:assert`。

## Global Constraints

- 正式 CDN 统一使用 `https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211`。
- `zod mvu`、`zod 定义`、`后台数据维护`和`自动更新角色卡`必须开启。
- `变量结构测试`必须关闭且保留 localhost import。
- 七个小手机脚本的 localhost import 和启用状态不变。
- PNG 只能通过同目录临时文件、验证和原子 rename 更新。

---

### Task 1: 固化角色卡基础运行脚本

**Files:**
- Modify: `scripts/test-package-winter-phone-card.mjs`
- Modify: `scripts/package-winter-phone-card.mjs`
- Modify: `src/寒冬末日/自动更新角色卡版本.yaml`
- Modify atomically: `src/末世寒冬 - 星穹秩序.png`

**Interfaces:**
- Consumes: `packageWinterPhoneCard({ input, worldbook, output })` 现有原子打包流程。
- Produces: `RUNTIME_SCRIPT_DEFINITIONS` 稳定脚本定义，以及可重复打包的最终 PNG。

- [ ] **Step 1: 编写失败测试**

在 `scripts/test-package-winter-phone-card.mjs` 对打包后的 `tavern_helper.scripts` 增加精确断言：

```js
assert.equal(findScript('zod mvu').enabled, true);
assert.deepEqual(findScript('zod 定义'), {
  enabled: true,
  content:
    "import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/变量结构/index.js'",
});
assert.deepEqual(findScript('后台数据维护'), {
  enabled: true,
  content:
    "import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/伊甸后台数据辅助/index.js'",
});
assert.equal(findScript('变量结构测试').enabled, false);
assert.deepEqual(findScript('自动更新角色卡'), {
  enabled: true,
  content:
    "import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/自动更新角色卡/index.js'",
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-package-winter-phone-card.mjs`  
Expected: FAIL，原因是正式脚本仍关闭或自动更新脚本不存在。

- [ ] **Step 3: 实现最小打包规则**

在 `scripts/package-winter-phone-card.mjs` 导出并应用基础运行脚本定义：

```js
export const RUNTIME_SCRIPT_DEFINITIONS = Object.freeze([
  {
    id: 'c7c40c6c-a73d-4363-83bb-077f7b3e3200',
    name: 'zod mvu',
    enabled: true,
  },
  {
    id: '62e84891-c986-4730-a2dd-82e3676104d2',
    name: 'zod 定义',
    enabled: true,
    content:
      "import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/变量结构/index.js'",
  },
  {
    id: '5ea5d786-2ff5-4744-b684-4b91d0aa6b9b',
    name: '后台数据维护',
    enabled: true,
    content:
      "import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/伊甸后台数据辅助/index.js'",
  },
  {
    id: '689f697c-34f4-496c-a324-3d39e55db69b',
    name: '变量结构测试',
    enabled: false,
  },
  {
    id: '76a4249a-e849-5f5b-8bd5-a6f89b6400a0',
    name: '自动更新角色卡',
    enabled: true,
    content:
      "import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/自动更新角色卡/index.js'",
  },
]);
```

对已有脚本保留 `info/button/data/export_with`，只更新定义中显式提供的 `enabled/content`；自动更新脚本不存在时创建标准 Tavern Helper 脚本外形。

- [ ] **Step 4: 运行测试确认通过**

Run: `node scripts/test-package-winter-phone-card.mjs`  
Expected: PASS，包含脚本状态、唯一 ID、幂等字节和失败不覆盖验证。

- [ ] **Step 5: 提升自动更新版本并原子写入 PNG**

将 `src/寒冬末日/自动更新角色卡版本.yaml` 改为：

```yaml
版本: 1.0.1
```

Run:

```powershell
node scripts/package-winter-phone-card.mjs --input 'src/末世寒冬 - 星穹秩序.png' --worldbook 'src/寒冬末日.json' --write
```

Expected: 原子更新成功，解码后满足全部脚本终态。

- [ ] **Step 6: 最终验证**

Run:

```powershell
node scripts/test-package-winter-phone-card.mjs
pnpm exec eslint --no-ignore scripts/package-winter-phone-card.mjs scripts/test-package-winter-phone-card.mjs
git diff --check
```

Expected: 全部成功，且仅计划文件发生改动。

- [ ] **Step 7: 提交**

```powershell
git add -- 'scripts/package-winter-phone-card.mjs' 'scripts/test-package-winter-phone-card.mjs' 'src/寒冬末日/自动更新角色卡版本.yaml' 'src/末世寒冬 - 星穹秩序.png'
git commit -m "feat(winter): enable card runtime scripts"
```
