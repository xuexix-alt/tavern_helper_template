# 寒冬末日组件层 Token 化维护指南

> 目标：让 `component` 层不再出现硬编码颜色（`#xxxxxx`、`rgba(...)`、`hsla(...)`），统一走共享 token，便于后续 AI 按规则持续维护。

## 1. 分层边界（执行标准）

- `tokens 层`：仅定义变量，不写业务选择器  
  文件：`src/寒冬末日/界面/shared/theme-tokens.css`
- `layout/shell 层`：仅定义壳布局、tabbar、移动端补丁  
  文件：`src/寒冬末日/界面/shared/shell-layout.css`
- `component 层`：只写业务组件结构与样式语义，不写硬编码颜色  
  目录：`src/寒冬末日/界面/状态栏/components` 与 `src/寒冬末日/界面纯UI版/状态栏/components`

### 1.1 维护范围约束

- `src/寒冬末日/界面不含正文剧情` 已停止维护，不再纳入 token 化对齐范围。
- 后续“同名组件对齐”仅指 `界面` 与 `界面纯UI版` 两套。

## 2. 已完成（本轮）

- [x] `WorldSection.vue`（两套项目）  
  改为读取 `--world-*` token，不再写 `rgba(...)`
- [x] `StoryStreamObserver.vue`（两套项目）  
  改为读取 `--stream-*` token，不再写 `#xxxxxx / rgba(...)`
- [x] `TextHighlight.vue`（两套项目）  
  改为读取 `--highlight-mark-*` token
- [x] 在 `theme-tokens.css` 增加上述组件 token（`--world-*`、`--stream-*`、`--highlight-mark-*`）
- [x] `ReportSection.vue`（两套项目）  
  组件内 `#xxxxxx / rgba(...)` 已全部替换为 `var(--report-*)`
- [x] 在 `theme-tokens.css` 增加 `--report-*` token（承接 `ReportSection` 的状态色、面板色、错误态）
- [x] `ShelterSection.vue`（两套项目）  
  组件内 `#xxxxxx / rgba(...)` 已全部替换为 `var(--shelter-*)`
- [x] 在 `theme-tokens.css` 增加 `--shelter-*` token（含基础色值与组合渐变 token）
- [x] `CharactersSection.vue`（两套项目）  
  组件内 `#xxxxxx / rgba(...)` 已全部替换为 `var(--character-* / --btn-* / --card-*)`
- [x] 在 `theme-tokens.css` 增加 `--character-*` token（角色状态、血条渐变、模态层、浅色主题覆盖）
- [x] `StorySection.vue`（两套项目）  
  组件内 `#xxxxxx / rgba(...)` 已全部替换为 `var(--story-* / --theme-* / --accent-*)`
- [x] 在 `theme-tokens.css` 增加 `--story-*` token（故事工具栏、图片按钮、筛选芯片、模块面板）
- [x] `MissionSection.vue`（两套项目）  
  组件内 `#xxxxxx / rgba(...)` 已全部替换为 `var(--mission-* / --theme-* / --accent-*)`
- [x] 在 `theme-tokens.css` 增加 `--mission-*` token（主线任务卡片、进度/情报状态、浅色主题覆盖）
- [x] `ChoicesSection.vue`（两套项目）  
  组件内 `#xxxxxx / rgba(...)` 已全部替换为 `var(--choices-* / --theme-* / --btn-*)`
- [x] 在 `theme-tokens.css` 增加 `--choices-*` token（选项弹层、输入聚焦态、按钮主次状态）
- [x] `SearchBar.vue`（两套项目）  
  组件内 `#xxxxxx / rgba(...)` 已全部替换为 `var(--search-* / --theme-* / --btn-*)`
- [x] 在 `theme-tokens.css` 增加 `--search-*` token（搜索条容器、输入框、清除按钮、发送按钮、选项按钮）

## 3. 待完成清单（按优先级）

说明：下面数字是硬编码命中数（用于排序，不是 bug 数）。

当前组件层硬编码命中总数：`0`（上一轮 `707`，本轮净减少 `707`）。

当前待完成组件：无（`界面` + `界面纯UI版` 组件层硬编码已清零）

## 4. Token 命名约定

- 组件域前缀：`--world-*`、`--stream-*`、`--mission-*`、`--character-*`
- 语义后缀优先：`-bg`、`-border`、`-text`、`-shadow`
- 状态类后缀：`-hover-*`、`-active-*`、`-disabled-*`、`-error-*`
- 禁止直接在组件里新增 `#xxxxxx` 或 `rgba(...)`

## 5. 标准改造流程（AI 可直接照做）

1. 扫描目标组件中的硬编码颜色。
2. 在 `theme-tokens.css` 新增语义化变量（不要在组件文件里定义颜色变量）。
3. 组件样式替换为 `var(--xxx)`。
4. 若存在 `var(--xxx, rgba(...))` fallback，把 fallback 也上收进 token，组件只保留 `var(--xxx)`。
5. 同名组件在两个项目里要同步处理，避免再次漂移。
6. 执行 `pnpm run build:dev` 验证。

## 6. 常用扫描命令

```powershell
# 扫描组件层硬编码颜色
rg -n --glob '*.vue' "#(?:[0-9a-fA-F]{3,8})\b|rgba?\(|hsla?\(" `
  src/寒冬末日/界面/状态栏/components `
  src/寒冬末日/界面纯UI版/状态栏/components

# 查找仍含 fallback 色值的 var()
rg -n "var\([^\)]*,\s*(rgba?\(|#)" `
  src/寒冬末日/界面/状态栏/components `
  src/寒冬末日/界面纯UI版/状态栏/components
```

## 7. 回归检查点

- 移动端：页脚 tab 区域、剧情流式观察、选项弹层、角色弹层
- 主题切换：`apocalypse_tech / jade_green / parchment / milky`
- 可读性：高亮文字、错误态/成功态颜色对比
- 交互：hover/active/disabled 状态是否仍清晰

## 8. 防回退机制（CI）

- 新增脚本：`pnpm run check:component-tokens`
- 检查范围：`src/寒冬末日/界面/状态栏/components` 与 `src/寒冬末日/界面纯UI版/状态栏/components`
- 失败条件：
  - 命中硬编码颜色：`#xxxxxx` / `rgba(...)` / `hsla(...)`
  - 命中颜色 fallback：`var(--xxx, rgba(...))` 或 `var(--xxx, #xxxxxx)`
- 工作流接入：`.github/workflows/bundle.yaml` 已在构建前执行该检查，命中即中断 CI。
