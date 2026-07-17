# same-layer-pre APPLE 主题 UI/UX 设计规格

**状态：** 已获用户批准，待实施计划

## 目标

为 `same-layer-pre` 增加第七套 `APPLE` 主题，采用清霜阅读视觉、舒展正文密度和克制的物理弹簧交互；保留原六套主题与所有既有业务功能，默认主题继续为 `amber`（琥珀）。

## 已批准的设计

### 视觉架构

- 新增 `apple` 主题值、`APPLE` 菜单项和 `.theme-apple` 主题类。
- APPLE 是可在 pre 阅读器主题菜单中主动选择的第七套主题；“只在深色 pre 阅读器中启用”描述的是它的冷灰黑视觉基调，不是隐藏或禁用菜单项。它不改变默认主题，首次加载仍为 `amber`（琥珀）。不使用霓虹、扫描线或终端噪声。
- 正文约 16px，行距约 1.9，增加消息卡内边距和段落留白；标题收紧字距，正文使用系统字体与中文系统字体。
- 半透明材质只用于顶栏、输入区、工具栏和抽屉；正文卡片保持稳定、低装饰，避免多层玻璃叠加。
- 信息层级：剧情正文 > 当前操作 > 楼层信息 > 系统状态。元数据降低对比度。
- 通过 APPLE 专属设计 tokens 和主题选择器隔离，禁止复制业务组件。

### 交互与响应式

- 保留现有按钮、菜单、抽屉和提交事件；不新增拖拽、滑动或业务状态。
- 按钮在按下时提供即时缩放与材质反馈，松开后仍走原点击事件。
- 顶部菜单从触发按钮方向展开，打开/关闭路径一致，可中途反向。
- 角色抽屉从左侧、画廊抽屉从右侧进入，使用轻微回弹弹簧曲线；关闭时原路返回。
- 移动端角色/画廊把手固定为左右边缘浮层，覆盖在正文之上，不参与布局计算、不占用正文显示宽度；左侧打开角色，右侧打开画廊。
- 系统与地图入口、内容和业务逻辑不变，只调整 APPLE 浮层外观；手机端为底部面板，桌面端保持居中面板。
- 优先使用 CSS `linear()` 弹簧曲线，不支持时回退到现有贝塞尔曲线。
- 适配 375、768、1024、1440px，禁止横向滚动，正文不被底部输入区遮挡。
- `prefers-reduced-motion` 移除回弹和大位移并改用短淡入淡出；`prefers-reduced-transparency` 提高表面不透明度；`prefers-contrast: more` 增强文字、边框和焦点环。

## 范围与不变量

### 允许修改

- `src/寒冬末日/same-layer-pre/界面/状态栏/types.ts`：增加 `apple` 主题类型。
- `src/寒冬末日/same-layer-pre/界面/状态栏/useSameLayerPre.ts`：允许 APPLE 主题类名，保留默认 `amber`。
- `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`：增加菜单项、APPLE 主题视觉样式、浮动把手样式和响应式覆盖。
- `src/寒冬末日/界面同层版/界面/状态栏/theme-tokens.css`：增加 APPLE 的基础变量和完整 `--demo-*` 派生变量（该文件由 pre 的 `index.ts` 在 shared tokens 之后导入）；APPLE 类未激活时不得改变原主题。若需要通用基础变量，才触及 `src/寒冬末日/界面/shared/theme-tokens.css`，且必须保持 APPLE 根类前缀。
- `src/寒冬末日/__tests__/sameLayerPreSource.test.js`：覆盖主题枚举、菜单入口、默认主题和原主题隔离；必要时只增加 APPLE 视觉契约断言。
- 允许构建生成但只可纳入 APPLE 相关的 `dist/寒冬末日/same-layer-pre/界面/状态栏/index.html`、`index.js.map`、`main.css.map`；其他 `dist/**` 变更不属于本设计范围。

### APPLE 视觉 token 基线

| 角色 | 目标值（允许在实现中做小幅对比度校准） |
| --- | --- |
| 页面背景 | 冷灰黑 `#0f1115` 附近，避免纯黑 |
| 正文 | 柔和白 `#f4f6f8` 附近，正文对比度至少 7:1 |
| 次要文字 | 冰灰 `#aeb6c2` 附近，仍可读 |
| 强调色 | 低饱和冰蓝灰 `#9fb7d0` 附近，不使用霓虹高饱和色 |
| 表面 | 半透明冷灰层，输入/工具/抽屉不透明度提高后仍保持层级 |
| 焦点环 | 至少 2px、可见且不依赖颜色 alone |

### 必须保持不变

- 消息生成、流式渲染、重生、回退删除、取消生成。
- MVU 变量读写、角色面板数据来源。
- 插件原生图片真相、画廊引用、事件协议和日志业务。
- 系统、地图、选项、输入框的业务处理与现有事件名。
- 原有 `tech`、`dark`、`gold`、`ios`、`ipod`、`amber` 六套主题的视觉和行为。
- 默认主题仍为 `amber`。

## 验收标准

1. 主题菜单新增 `APPLE`，可选中并应用 `.theme-apple`；首次加载默认仍为琥珀，且 APPLE 不会被条件隐藏。
2. APPLE 下正文计算样式的 `font-size` 在 15–17px、`line-height` 在 1.8–2.0；正文/输入/顶栏/工具/抽屉使用 token 表中的角色色，且 APPLE 选择器均以 `.theme-apple` 或 pre 根节点为前缀。
3. 在 375、768、1024、1440px 视口检查：左右把手为 `position: fixed` 或相对阅读器根的 `absolute`，不在 flex/grid 流中；加入/移除把手前，正文容器 `getBoundingClientRect().width/left/right` 差值均不超过 1px；左/右按钮分别调用既有角色/画廊抽屉动作。
4. 普通按钮 `pointerdown`/`:active` 有不超过 120ms 的缩放/材质反馈；抽屉位移不超过 24px、总时长 180–420ms，可在过渡中反向，且动画期间输入元素仍可聚焦。
5. 原六主题在相同页面和相同断点下的关键 token 与截图/DOM 结构不发生 APPLE 规则导致的变化。
6. 四个目标宽度 `document.documentElement.scrollWidth === document.documentElement.clientWidth`，正文末端与输入区之间保留可见间距。
7. `prefers-reduced-motion: reduce` 下抽屉无位移/回弹且淡入淡出不超过 160ms；`prefers-reduced-transparency: reduce` 下表面 alpha 提高到至少 0.92；`prefers-contrast: more` 下正文对比度至少 7:1、焦点环至少 2px。
8. 通过 pre 静态测试、组件 token 检查、生产构建、`git diff --check` 和浏览器视觉/交互检查。

## 风险与处理

- 共享组件的样式覆盖可能泄漏到其他主题：所有新增规则必须以 `.theme-apple` 或 pre 根节点为前缀，并用旧主题回归检查拦截。
- Teleport 到 `body` 的系统/地图面板可能脱离主题祖先：必要时通过已有主题同步机制或明确的 APPLE 根类补齐样式作用域，不改变面板业务。
- 物理弹簧在低端浏览器上可能不支持 `linear()`：提供现有贝塞尔曲线回退，并确保 reduced-motion 下无位移。
- 工作树已有用户的 dist、日志、计划文档和临时文件改动：实施时只处理 APPLE 相关源文件和对应生成物，不清理或覆盖无关改动。

## 实施后验证

- 运行 `node --test` 的 pre 源码契约测试及现有画廊测试。
- 运行 `pnpm check:component-tokens`、生产构建和 `git diff --check`。
- 在实际 pre 页面选择 APPLE，验证主题切换、默认琥珀、两侧浮动把手、角色/画廊抽屉和系统/地图面板。
- 在 375、768、1024、1440 宽度，以及 reduced-motion / reduced-transparency / more-contrast 环境下复核视觉与交互。
