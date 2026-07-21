# 寒冬角色卡双 PNG 元数据同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `末世寒冬 - 星穹秩序.png` 的 `chara` 与 `ccv3` 元数据始终写入同一份更新后的角色卡，确保酒馆实际导入七个小手机脚本。

**Architecture:** 扩展现有 PNG 读写器，使其能按关键字读取角色卡文本块；打包前要求 `chara`、`ccv3` 均存在，打包时用同一角色卡对象替换两块。回归测试直接解码两块并比较，防止再次出现只改兼容副本的情况。

**Tech Stack:** Node.js ESM、PNG `tEXt` chunk、`node:assert`、现有原子写入打包器。

## Global Constraints

- 保留 `chara` 与 `ccv3` 两个文本块。
- 两个文本块必须包含完全一致的角色卡 JSON。
- 七个小手机脚本继续使用 `tavern_helper_template@20260211` CDN import 并保持开启。
- 不修改小手机业务代码、脚本名称、脚本 ID 或运行顺序。
- 输入缺少 `chara` 或 `ccv3` 时必须在覆盖 PNG 前失败。

---

### Task 1: 同步双角色卡元数据并重新发布 PNG

**Files:**
- Modify: `scripts/test-package-winter-phone-card.mjs`
- Modify: `scripts/package-winter-phone-card.mjs`
- Modify: `src/末世寒冬 - 星穹秩序.png`

**Interfaces:**
- Consumes: `packageWinterPhoneCard({ input, worldbook, write })` 与 PNG 中的 `chara`、`ccv3` 文本块。
- Produces: `readCharacterCardPng(filename, keyword = 'chara'): Promise<object>`；输出 PNG 的两个角色卡文本块内容一致。

- [ ] **Step 1: 写入能够复现旧 `ccv3` 未更新问题的失败测试**

在临时 PNG 完成打包后分别读取两个文本块：

```js
const charaCard = await readCharacterCardPng(tempPng, 'chara');
const ccv3Card = await readCharacterCardPng(tempPng, 'ccv3');
assert.deepEqual(ccv3Card, charaCard, 'chara 与 ccv3 必须写入同一份角色卡数据');
assert.equal(ccv3Card.data.extensions.tavern_helper.scripts.length, 15);
await assert.rejects(() => readCharacterCardPng(tempPng, 'missing'), /missing/);
```

- [ ] **Step 2: 运行测试并确认失败原因是读取 API 尚未按关键字读取**

Run: `node scripts/test-package-winter-phone-card.mjs`

Expected: FAIL；旧实现忽略第二个参数，无法证明或执行 `ccv3` 独立读取。

- [ ] **Step 3: 最小实现双元数据读写**

在打包器中定义并使用两个关键字：

```js
const CARD_KEYWORDS = Object.freeze(['chara', 'ccv3']);

function decodeCard(chunks, keyword = CARD_KEYWORDS[0]) {
  const cardChunk = chunks.find(chunk => textChunkParts(chunk)?.keyword === keyword);
  const parts = cardChunk && textChunkParts(cardChunk);
  if (!parts) throw new Error(`PNG 中不存在 ${keyword} 角色卡数据`);
  return JSON.parse(Buffer.from(parts.text, 'base64').toString('utf8'));
}

function encodeCardChunk(card, keyword) {
  const payload = Buffer.from(JSON.stringify(card), 'utf8').toString('base64');
  return { type: 'tEXt', data: Buffer.from(`${keyword}\0${payload}`, 'latin1') };
}
```

`packageWinterPhoneCard` 在修改前逐一调用 `decodeCard(chunks, keyword)` 验证两个块存在；输出时对命中 `CARD_KEYWORDS` 的文本块调用 `encodeCardChunk(card, keyword)`，从而写入同一对象。

- [ ] **Step 4: 运行回归测试并重新打包真实角色卡**

Run: `node scripts/test-package-winter-phone-card.mjs`

Expected: `winter phone card packaging test passed`

Run: `node scripts/package-winter-phone-card.mjs --input "src/末世寒冬 - 星穹秩序.png" --worldbook "src/寒冬末日.json" --write`

Expected: `验证通过：7 个小手机脚本；已原子写入`

- [ ] **Step 5: 解码真实 PNG 并验证导入源数据**

分别读取 `chara`、`ccv3`，断言深度相等、脚本数为 15，且七个 `小手机-` 脚本全部开启并含 `@20260211`。

- [ ] **Step 6: 提交、合并并推送**

```bash
git add scripts/package-winter-phone-card.mjs scripts/test-package-winter-phone-card.mjs "src/末世寒冬 - 星穹秩序.png"
git commit -m "fix(winter): sync PNG character metadata"
git push --atomic origin HEAD:feature/winter-portable-phone HEAD:20260211
```

Expected: 远端 `feature/winter-portable-phone` 与 `20260211` 均指向同一最终提交。
