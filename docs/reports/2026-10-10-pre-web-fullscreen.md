# PRE 网页内全屏：实现与验证

日期：2026-10-10。现场：`http://127.0.0.1:8000/`，末世寒冬 - 星穹秩序，当前故事 #5，聊天 6 条。

## 实现

- 桌面顶栏“全屏”、窄屏“更多 → 网页全屏”；进入后顶栏保留“退出”。
- 原 iframe 原位展示，无搬移、重建或浏览器 Fullscreen API；真实宿主 `.mes_text` 与插件手势链路不变。
- 独立宿主 style 和所有权属性调整祖先裁剪/层级。退出只释放本功能的样式，不覆盖同期宿主 inline style 更新。
- 采用宿主 visualViewport 实际宽高和偏移；全屏解除原 720px 最小高度，正文独立滚动。
- 酒馆顶栏 z-index=3005 会遮挡 PRE：仅全屏时隐藏该导航；保留图片插件弹窗与终端在 PRE 上方。
- iframe 内 Escape 先交给已显示在上方的宿主浮层，再处理 PRE 弹窗，最后退出全屏。必须完成的自动开局设置会消费 Escape。
- pagehide、Vue 卸载、CHAT_CHANGED 和承载节点移除释放状态。MutationObserver 必须在宿主 realm 中创建并注册：真实 Chrome 会停止执行已移除 iframe 注册的异步回调。回归测试在 iframe realm 加载控制器，复现并验证该边界。
- 共享 BottomComposer 仅额外暴露现有弹窗状态与关闭函数；未修改终端、生成、MVU、图片插件实现。

## 自动验证

- `preWebFullscreen.browser.test.cjs`：8/8 通过（7 个行为子测试及父测试）。使用本机 Chrome headless 和项目原 PhoneShell。
- PRE `界面/状态栏/__tests__/*.test.js`：53/53 通过。
- 相关 TypeScript/Vue 文件 ESLint：通过。
- 定向生产构建：通过，更新 PRE 的 index.html 与两个 source map；保留包体大小和 Browserslist 数据陈旧提示。
- `git diff --check`：通过。
- 独立只读审查发现自动开局设置的 Escape 边界，核对既有不可关闭逻辑后已修正。

## 现场验证

酒馆助手“允许监听”未开启；正式入口从 CDN 加载。验证期间仅在调试页临时将 PRE iframe 的加载地址改为本地构建预览，未写回角色卡、正则或聊天消息。

1. 桌面全屏：iframe 与 UI 外壳尺寸匹配宿主可视区域（约 1511×782）；原 iframe、contentWindow 与宿主消息节点保持身份。
2. 390×700 移动视口：frame/shell 为 390×700，scrollWidth/clientWidth 均 390；输入框底部在可视区域内。
3. 模拟键盘：将宿主 visualViewport 可用高度设为 320，frame/shell 均为 320，输入框底部约 299；恢复后回到 700。此项是几何模拟，不代表真实手机键盘实测。
4. 伊甸终端：在全屏上方正常显示；宿主中心命中终端；Escape 关闭终端后 PRE 仍全屏，焦点回到“伊甸终端”入口。
5. 终端向 PRE 填入验收草稿：使用现有 `submitActionToHost(composer.insert)` 接口，目标故事 messageId 为 5；草稿正确出现在 PRE 输入框。随后恢复原草稿，聊天仍为 6 条，未发送。
6. 正文成品图打开 st-chatu8 原生预览。预览显示后，Escape 能关闭宿主预览而保留 PRE 全屏。
7. 剧情选项优先消费 Escape；随后 Escape 退出全屏。退出后全屏 style 不存在、宿主所有权属性数量为 0、酒馆导航恢复 visible，草稿不变。

## 原有测试失败与边界

- `src/寒冬末日/__tests__/sameLayerPreSource.test.js`：64/65 通过，第 57 项源码断言仍要求无 `.ts` 后缀的 hostGestureDispatch 导入，并包含已抽到 prePluginMedia 的旧字段断言。HEAD 中已经使用 `.ts` 后缀；这两份相关生产源码本次未修改。保留原测试，不扩大到图片适配重构。
- `src/寒冬末日/__tests__/phoneBridge.test.ts`：经 ts-node/CommonJS 执行，213 行断言要求不同角色名返回 unavailable，但当前 ownerMatches 已取消严格角色名限制，实际为 available。phoneBridge 与该测试本次均未修改。
- 未发起真实 AI、图片生成或 MVU 重处理请求；不宣称这些付费/写入链路经过本轮端到端验证。
- 未验证真实手机软键盘、长按和三触硬件输入；已验证的移动视口及宿主几何模拟不替代实机测试。
- 本报告记录实现验收结果；代码与构建产物一同发布。CDN 刷新需在推送后单独执行，并通过正式 URL 返回内容与发布产物的 SHA-256 校验确认。
