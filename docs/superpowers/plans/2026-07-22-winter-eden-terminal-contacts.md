# Winter Eden Terminal Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-role MVU communication state with save-scoped manual contacts and group invitations, brand the phone as “伊甸终端”, and unlock its narrative ability at shelter Lv1.

**Architecture:** The latest MVU snapshot supplies structurally recognized character candidates. PhoneDB `contactPrefs`, keyed by runtime `sessionKey`, owns durable contact and Eden-group membership state. Shared PhoneShell and apps receive generic branding and contact-management capabilities from the winter adapter.

**Tech Stack:** TypeScript, Zod MVU, IndexedDB/PhoneDB, DOM APIs, Node test runner, ts-node, Webpack.

## Global Constraints

- Keep `getVariables({ type: 'message', message_id: 'latest' })` as the only MVU snapshot source.
- Candidate recognition requires an owned `登场状态` property but accepts both values and does not require `姓名` or `通讯`.
- Persist all contact and group state under the current runtime `sessionKey`; never share it across chat saves.
- Never write contacts to MVU or mutate old snapshots; ignore legacy role-level `通讯` data.
- Keep shared platform defaults generic and inject “伊甸终端” from the winter adapter.
- Execute inline in the current workspace without agents or a worktree.

---

### Task 1: Character candidate extraction

**Files:**
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/winterAdapterCore.ts`
- Modify: `src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`

**Interfaces:**
- Produce `WinterContactCandidate = { id: string; name: string; temporary: boolean }`.
- Produce `extractWinterContactCandidates(statData: unknown): WinterContactCandidate[]`.

- [ ] Write a failing test that passes system roots, two main characters with `登场`/`离场`, one old character without `姓名`, one non-character without `登场状态`, and one temporary NPC. Expect only the three character identities and key fallback for missing names.
- [ ] Run `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`; verify failure is the missing export.
- [ ] Implement an exact fixed-root exclusion set, require `Object.prototype.hasOwnProperty.call(role, '登场状态')`, resolve `name` from non-empty `role.姓名 || key`, and preserve `main:<key>`/`temporary:<key>` identities.
- [ ] Re-run the command and verify `winter phone adapter tests passed`.
- [ ] Commit only the two task files with `feat: extract winter terminal contact candidates`.

### Task 2: Shared contact-management UI contract

**Files:**
- Modify: `src/小手机平台/apps/phoneApps.ts`
- Modify: `src/小手机平台/__tests__/shellSource.test.js`

**Interfaces:**
- Extend `PhoneContactView` with `added: boolean` and `inEdenGroup: boolean`.
- Extend `PhoneAppServices` with `addContact(contactId: string): Promise<void>` and `setContactGroupMembership(contactId: string, included: boolean): Promise<void>`.

- [ ] Add failing assertions for `addContact(item.id)`, `setContactGroupMembership(item.id, !item.inEdenGroup)`, and visible copy `联系人`, `可添加人物`, `邀请入群`, `移出群聊`.
- [ ] Run `node --test src/小手机平台/__tests__/shellSource.test.js`; verify the new assertions fail.
- [ ] Render two contact sections. Candidate rows get “添加”; added rows retain the private-chat button and get an independent group toggle. After successful mutations call `context.requestRender()`; on failure announce the error without optimistic state.
- [ ] Re-run the shell tests and verify all pass.
- [ ] Commit the two task files with `feat: add manual contact controls`.

### Task 3: Save-scoped contacts and manual group membership

**Files:**
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts`
- Modify: `src/寒冬末日/__tests__/winterPhoneSource.test.js`
- Modify: `src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`

**Interfaces:**
- Add internal `ContactPreferenceRecord` containing `kind: 'manual-contact'`, `name`, `addedAt`, `inEdenGroup`, and optional `invitedAt`.
- Consume `extractWinterContactCandidates` and implement the Task 2 service methods.

- [ ] Add failing source assertions for `listRecords('contactPrefs', sessionKey)`, `putRecord('contactPrefs', ...)`, `kind: 'manual-contact'`, `addContact`, and `setContactGroupMembership`; assert the adapter no longer uses contact availability, terminal types, or T2/T4 membership policy.
- [ ] Run the winter source and adapter tests; verify failure against MVU-derived contacts.
- [ ] Make `listContacts()` asynchronous and merge current candidates with current-session manual records. Persist `lastKnownName`, retain persisted-only contacts, require a current candidate when adding, and recheck captured `sessionKey` before every write.
- [ ] Build `eden-group:residents` participants only from records with `inEdenGroup === true`. Require an added contact for private conversations and require invited participants for group sends. Make repeat add/invite/remove idempotent.
- [ ] Re-run both tests and verify pass.
- [ ] Commit the three task files with `feat: persist winter contacts per chat`.

### Task 4: Remove role-level communication variables

**Files:**
- Modify: `src/寒冬末日/schema.ts`
- Modify: `src/寒冬末日/世界书/寒冬末日/[initvar].yaml`
- Modify: `src/寒冬末日/世界书/变量/临时NPC变量结构示意.txt`
- Modify: `src/寒冬末日/世界书/变量/[mvu_update]变量更新规则.yaml`
- Modify: `src/寒冬末日/世界书/变量/[mvu_update]变量输出格式.yaml`
- Modify: `src/寒冬末日/世界书/寒冬末日/伊甸一次性指令和主线任务.txt`
- Modify: `src/寒冬末日/__tests__/winterPhoneSchema.test.ts`
- Modify: `src/寒冬末日/__tests__/winterPhoneSource.test.js`
- Generate: `src/寒冬末日/schema.json`

**Interfaces:**
- Remove per-role `通讯`; preserve root `通讯网络`.

- [ ] Rewrite the schema test first: parse a legacy role containing `通讯`, assert parsing succeeds and the parsed role does not own `通讯`; retain the existing `通讯网络` default/validation checks. Add source assertions that current role templates contain none of `已建立联系`, `终端类型`, `终端状态`, or `信号状态`.
- [ ] Run the winter schema and source tests; verify they fail because role communication still exists.
- [ ] Delete `通讯Schema`, the role property/default, all init role blocks, temporary-NPC blocks, communication patch checks/examples, T2 distribution rules, and the obsolete terminal reward. Leave root `通讯网络` untouched.
- [ ] Run `pnpm run dump` and verify the generated JSON Schema retains `通讯网络` but no role communication property.
- [ ] Re-run schema/source tests and verify pass.
- [ ] Commit the listed source/generated files with `refactor: remove role communication variables`.

### Task 5: Adapter-specific “伊甸终端” branding

**Files:**
- Modify: `src/小手机平台/shell/phoneShell.ts`
- Modify: `src/小手机平台/__tests__/shellSource.test.js`
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryBetaModal.vue`
- Modify: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`

**Interfaces:**
- Extend `PhoneShellOptions` with optional `productName` and `statusName`; defaults remain `小手机` and `星穹通信`.

- [ ] Add failing assertions that shared defaults remain, the adapter passes `productName: '伊甸终端'` and `statusName: '伊甸系统'`, and Pre visible/accessibility copy uses “伊甸终端”.
- [ ] Run shell, same-layer-pre, and winter source tests; verify branding assertions fail.
- [ ] Store normalized branding in PhoneShell and use `productName` for dialog aria-label, initial title, and home title. Pass winter values from the adapter and update Pre labels without renaming runtime API keys.
- [ ] Re-run the three source suites and verify pass.
- [ ] Commit the listed files with `feat: brand winter phone as eden terminal`.

### Task 6: Lv1 Eden Terminal ability

**Files:**
- Modify: `src/寒冬末日/世界书/寒冬末日/庇护所升级能力.txt`
- Modify: `src/寒冬末日/世界书/寒冬末日/庇护所能力_1-10级维护清单.yaml`
- Modify: `src/寒冬末日/世界书/寒冬末日/庇护所能力_1-5级重写草案.yaml`
- Modify: `src/寒冬末日/世界书/寒冬末日/主流派起始偏置表.yaml`
- Modify: `src/寒冬末日/__tests__/winterPhoneSource.test.js`

**Interfaces:**
- Add canonical ability `social.eden_terminal_t1`; remove phone unlock dependence on `social.shift_ration_protocol_t2` and `social.eden_phone_mass_t4`.

- [ ] Add failing assertions that the master table includes `social.eden_terminal_t1` in Lv1 unlocks with `unlock_level: 1`, and excludes old phone abilities from unlock lists and adapter authorization.
- [ ] Run the winter source test and verify failure.
- [ ] Add “📱伊甸终端” as an additional Lv1 social ability. Remove old phone-specific T2/T4 unlocks/definitions from the runtime master, align maintenance/draft sources, and replace starting-bias references with the new key.
- [ ] Re-run the source test and verify pass.
- [ ] Commit the listed files with `feat: unlock eden terminal at shelter level one`.

### Task 7: Verification and production artifacts

**Files:**
- Generate matching outputs under `dist/小手机平台/脚本`, `dist/寒冬末日/脚本`, and `dist/寒冬末日/same-layer-pre`.

- [ ] Run `data.test.ts`, `winterPhoneSchema.test.ts`, `winterPhoneAdapter.test.ts`, and `phoneBridge.test.ts` with the repository ts-node command; run `shellSource.test.js`, `winterPhoneSource.test.js`, and `sameLayerPreSource.test.js` with `node --test`. Require exit code 0 for every command.
- [ ] Set `TAVERN_BUILD_PREFIXES` to `src/小手机平台;src/寒冬末日/脚本/小手机-90寒冬适配器;src/寒冬末日/脚本/伊甸后台数据辅助;src/寒冬末日/same-layer-pre`, set `TAVERN_SKIP_GENERATORS=1`, and run `pnpm exec webpack --mode production`.
- [ ] Search built artifacts for `伊甸终端`, `manual-contact`, and `social.eden_terminal_t1`; confirm the winter adapter output contains no `伊甸终端T2` or `social.eden_phone_mass_t4`.
- [ ] Commit only matching generated artifacts with `build: publish eden terminal contacts`.
