# 伊甸世界书编辑与灾后救亡实施计划

> Execution: subagent-driven-development for independent lore authoring; primary agent implements the coupled domain/storage/UI/runtime chain. Work in the current checkout, preserving the already-written health fix and unrelated st-chatu8 state. No deployment, commit or push requested.

**Goal:** 在 pre 系统面板编辑、预览并确认保存伊甸能力与救亡设定，以当前聊天世界书为正式来源。

**Architecture:** `src/寒冬末日/eden/` 提供纯数据校验、能力与救亡派生、世界书读写和酒馆适配。Vue 面板只编辑草稿；一个确认保存操作写入结构化正式文档及可供 AI 阅读的条目。后台辅助在新模式下使用正式文档，跳过旧掷点、旧等级奖励和旧摘要。

**Tech Stack:** Vue 3, TypeScript, Zod 4, TavernHelper worldbook/MVU APIs, node:test.

## Constraints

- 救亡只在灾后生效。首次取得有效技术、首次建立自持生产体系分别结算，同一成果不重复结算。
- 草稿不生效；确认写入成功才替换正式设定；失败保留草稿。读取当前聊天绑定世界书，切换聊天时终止旧会话操作。
- 新增和修改能力，四级六组默认能力，纪宁/慕小小条件简化为正式加入后由玩家确认。
- 世界书保存结构化文档和 AI 可读文字；只修改拥有 eden 标记的条目，保留手机、人物、开局等其他条目。
- 新模式以世界书为真源，旧存档未确认迁移前继续原有机制；超过四级不自动降级。
- pre 生成前刷新已保存条目的日期状态；重生应在删除旧楼层后刷新。未保存配置不能注入请求。
- 保持一次性指令及无关角色规则不变。现有脚本的健康修复保留。

## Task 1: Domain and worldbook repository

Files: `src/寒冬末日/eden/{model,defaults,worldbook,runtime}.ts`, `eden/__tests__/*.cjs`.

- [x] Write failing behavioral tests for defaults, validation, gate conditions, catastrophe-only deadlines, deduplication, stale revisions, new-chat isolation and unrelated-entry preservation.
- [x] Implement `EdenDocumentSchema`, `createDefaultEdenDocument`, `getEdenRuntime`, `renderEdenEntries`, `loadEdenDocument`, `saveEdenDocument`, `refreshEdenEntries`.
- [x] Run `node --test src/寒冬末日/eden/__tests__/*.cjs`.

## Task 2: Lore documents and legacy prompt alignment

Files: `世界书/寒冬末日/{末日救亡任务,伊甸技术}.txt`, legacy task/rule files and `世界书/index.yaml` as necessary.

- [x] Preserve the two supplied settings, all eighteen technologies and three agriculture-lv0 leads; separate acquisition and deployment achievements.
- [x] Gate old task/upgrade prompts when `eden.worldbookManaged` is enabled. New authored lore is seeded into the chat worldbook only after UI confirmation.
- [x] Verify YAML and existing directive metadata tests; review source for unconditional old upgrade and Imp reward instructions.

## Task 3: UI editor

Files: `eden/components/EdenSystemPanel.vue`, `界面同层版/界面/状态栏/components/WorkbenchTabs.vue`, `same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`.

- [x] Add pre-only 能力 / 救亡任务 / 技术 tabs; keep existing 指令 / 状态 / 日志 available.
- [x] Load saved document; explicitly load defaults into an unsaved draft. Support ability add/edit/remove, level, condition confirmation, authorization rooms, technical achievements and production achievements, and both lore texts.
- [x] Preview exact AI text, confirm-save, cancel edit; show save failures, loading and dirty states. Disable edits while generating or saving.
- [x] Verify UI using a browser harness with mock Tavern APIs at desktop and mobile widths, including persistence, failed save, cancellation and reopening.

## Task 4: Runtime integration

Files: `脚本/伊甸后台数据辅助/index.ts`, `same-layer-pre/界面/状态栏/useSameLayerPre.ts`, optional managed projection helpers.

- [x] Cache loaded worldbook documents on boot/update; scope cache by current chat. New mode cannot run legacy roll/reward/summary logic.
- [x] Project saved level, enabled abilities and actual authorized heating rooms into legacy MVU display fields without broad service grants; freeze AI changes to managed legacy fields.
- [x] Refresh AI entries before each pre generation, based on the retained transcript and current day. Load saved configuration on startup; surface write failures.
- [x] Verify behavioral integration tests against the real repository and projection logic.

## Task 5: Verification and review

- [x] Run domain, health, existing pre generation, opening-worldbook and directive tests.
- [x] Run targeted ESLint, formatting and `git diff --check`.
- [x] Build pre and the helper using `TAVERN_BUILD_PREFIXES`, skipping unrelated generators.
- [x] Request independent review of the final changed files; fix substantive findings and rerun affected checks.
- [x] Record exact delivered behavior and live validation limits in the final reply.
