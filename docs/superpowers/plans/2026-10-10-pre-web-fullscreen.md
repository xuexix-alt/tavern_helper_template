# PRE 网页内全屏实施计划

> 按用户已确认的原位 iframe 方案在当前会话执行；保留现有工作区与无关改动。

**目标：** PRE 铺满宿主可视区域，退出可恢复，不重建 iframe、不更改宿主楼层或插件行为。

**架构：** 独立 `preWebFullscreen.ts` 控制宿主定向样式、尺寸和恢复；`usePreWebFullscreen.ts` 管理 Vue 状态、生命周期和事件；App 提供上下文，StoryPagePre 消费状态与按钮。保持插件原生 `.mes_text` 手势转发。

## 约束与验收

- 原 iframe、contentWindow、真实消息节点与监听器保持身份；不调用浏览器 Fullscreen API，不移动节点。
- 样式采用独立 style 与带所有权的 attribute，退出不回写整个 style，保留酒馆助手同期更新。
- 祖先裁剪、transform 与 stacking context 只在全屏期间解除；iframe 层级低于原生插件菜单/预览。
- 宿主 visualViewport 决定尺寸；手机软键盘缩小时主体允许低于原 720px 下限。
- Esc 先让弹窗消费，随后退出全屏；切聊天、pagehide、卸载与 iframe 被移除时清理。
- 不发起真实 AI 或图片生成请求来验证布局。
- 伊甸终端保持宿主顶层显示；开关、Escape、焦点返回与 composer.insert 桥接必须在全屏中可用。

## 任务

- [x] 1. 编写并运行浏览器行为测试，覆盖原位身份、全屏尺寸、插件浮层点击、动态 iframe 高度恢复、重复切换和节点移除清理；先确认失败。
- [x] 2. 实现宿主控制器：`createPreWebFullscreenController(frame)`，暴露 `enter / updateViewport / exit / active`；用宿主 document 定向 CSS 消除祖先裁剪，用 observer 处理承载节点移除。
- [x] 3. App 提供响应式上下文，页面接入顶栏与更多菜单入口、可视区域高度、Esc 弹窗优先和退出恢复。
- [x] 4. 新增全屏 CSS：正文 flex 填充、短屏最小高度归零、输入栏保持可见、外壳去装饰，兼容现有主题。
- [x] 5. 运行新增浏览器测试、PRE 现有 Node 测试、相关 ESLint、定向生产构建、`git diff --check`。检查现场加载与插件预览；现场不可覆盖的路径如实记录。

结果见 `docs/reports/2026-10-10-pre-web-fullscreen.md`。原有测试失败独立记录，不作为新增全屏功能通过的证据。

## 验证命令

```powershell
node --test 'src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preWebFullscreen.browser.test.cjs'
node --test 'src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/*.test.js' 'src/寒冬末日/__tests__/sameLayerPreSource.test.js'
$env:TAVERN_BUILD_PREFIXES='src/寒冬末日/same-layer-pre'
$env:TAVERN_SKIP_GENERATORS='1'
npm run build
git diff --check
```
