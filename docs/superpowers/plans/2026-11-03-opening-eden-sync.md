# Opening 伊甸同步实施计划

依据：`../specs/2026-11-03-opening-eden-sync-design.md`，用户已批准实施。

**目标：** 寒冬新开局编辑初始伊甸，确认写入专属世界书后生成，系统页读取同一正式配置。

**架构：** 共用领域模型与能力组件；opening 保存纯草稿；确认时联合写入六条伊甸条目与开局上下文。世界书保存与 MVU 同步分阶段恢复，首次期限不因重试重置。

**约束：** 保留 5500 当前目录工作流；不修改 st-chatu8；不修改原聊天剧情和手机条目；其他故事默认不启用伊甸；最后提交、push 和 CDN 实际校验。

## 任务与接口

- [x] 1. 初始技术领域逻辑。`eden/model.ts` 新增 `initialTechnologies`（分支、0—5 等级、名称），默认空；统一已掌握技术集合参与任务和描述；初始技术重复登记拒绝，生产成果独立计时。先在 `eden/__tests__/eden.test.cjs` 补行为测试，确认失败后实现，运行原领域测试。
- [x] 2. 共享能力组件。新增 `EdenAbilityBoard.vue`（document/context/initialized，emit edit）及 `EdenAbilityFields.vue`（v-model document，emit update:modelValue）；从系统面板提取原模板与样式，不引入保存副作用。既有真实浏览器测试覆盖默认态、编辑、取消、保存。
- [x] 3. 开局可移植配置与 JSON。新增 `eden/openingConfig.ts`：`EdenOpeningConfigSchema`、`type EdenOpeningConfig`、`toEdenOpeningConfig(document,startDay)`、`createOpeningEdenDocument(config,missionLore,technologyLore)`。配置包含 startDay、level/levelNames/status/rooms/abilities/initialTechnologies，排除运行历史。runtime preset 可选 `integrations.eden`；完整包 v2 可选 eden 扩展，继续接受包 v1/裸 preset。先补导入导出行为测试。
- [x] 4. 联合保存编排。`eden/worldbook.ts` 暴露受 owner 保护的合并函数；新增 `eden/opening.ts` 保存函数，捕获 chat/binding/revision，单次 worldbook update，记录初始化指纹并校验回读，幂等重试。`EdenDocument` 可选 opening 初始化回执。完成保存后再同步新开局载体末日天数和能力；已存在剧情禁止重新初始化。先补 worldbook 内存接口行为测试，覆盖失败、切换、冲突及重试。
- [x] 5. 开局卡片与接入。新增 `EdenOpeningSetup.vue` 管理聊天级草稿、只读看板、编辑、初始技术、预览与提交公开方法。`OpeningSetupPanel` 提供业务插槽和禁用旧能力字段参数；`StoryPagePre` 挂载卡片、提交前校验/确认、同步、JSON 草稿导入导出与兼容宏摘要。共享 opening 编译增加可选能力摘要，旧同层默认不变。所有预览依赖变化使确认失效。
- [x] 6. 回归与真实交互。领域/世界书/导入导出测试，真实 Vue 390/900 宽度及失败重试；定向 ESLint、TypeScript、pre/辅助脚本生产构建。酒馆创建隔离新聊天，验证首次保存、首轮实际提示词、系统能力/任务一致及手机条目保留，最后恢复原聊天。
- [ ] 7. 审查及发布。审阅最终 diff，修复发现，记录现场验收范围，提交到 20260211，push，等待 bundle，刷新变动资源两个分支别名的 CDN，并以固定版本和实际使用入口下载哈希验证。

## 基础验证命令

```powershell
node --test src/寒冬末日/eden/__tests__/eden.test.cjs
node --test src/寒冬末日/eden/__tests__/editor.browser.test.cjs
```

新测试加入同目录并使用现有 ts-node/webpack/Playwright harness。生成路径与初始化过程沿用 `generatePreReply` / `prepareEdenGeneration`，不另建模型请求链。

## 执行记录

- 开始：主工作区只有前轮方案文档与原有 st-chatu8 状态，运行代码干净；保留当前 5500 服务对应目录原地实施。

- 提交前验收：51 项相关测试、两份既有 runtime opening 行为脚本、定向 ESLint/TypeScript 通过；现场验证保存、时间同步及请求构造。第 7 项的远端构建和 CDN 结果由提交后的交付消息记录。
