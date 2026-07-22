# 寒冬小手机 Pre 自动恢复与手动检测设计

**日期：** 2026-07-22
**范围：** `src/小手机平台` 与 `src/寒冬末日/same-layer-pre` 之间的最小运行时桥接

## 1. 问题与现场证据

当前现场的 `window.TavernPhone.getStatus()` 已返回 `READY`，owner、session 均正确且诊断为空，但 Pre 入口仍显示“手机·离线”。

Pre 目前只在组件挂载时读取一次 `window.top.TavernPhone`。当 Pre 先于 `00运行时管理器` 挂载时，bridge 会永久保存 `undefined`；运行时之后即使成功安装并进入 `READY`，Pre 也没有重新发现它的入口。

## 2. 目标

1. 运行时晚于 Pre 安装时，入口自动从“离线”恢复为可用。
2. Beta 面板提供一次性的“重新检测手机”操作，作为热重载和诊断兜底。
3. 自动恢复与手动检测共用同一套幂等重绑定逻辑，不引入轮询。
4. 默认主题移动端不再挤压手机按钮文字；Apple 系列主题保持现状。
5. 不改变 PhoneDB、AI、ChatLore、MVU、手机路由或 composer action 契约。

## 3. 运行时安装事件

`installPhoneRuntime()` 创建新实例时，先将实例写入 `window.top.TavernPhone`，再在 top window 派发固定的 runtime-installed 事件。

- 事件只表示“可以重新读取全局入口”，不携带 runtime、owner、session 或业务数据。
- Pre 收到事件后必须重新读取并校验 `window.top.TavernPhone`，不能信任事件载荷。
- 若运行时安装前已经存在，Pre 挂载时的立即检测负责接管；无需补发历史事件。
- 重复事件必须幂等，不能重复订阅 `status`、`unread` 或重复 attach host bridge。

## 4. Pre bridge 生命周期

`createPrePhoneBridge()` 从“接收固定 runtime 值”调整为“可重新解析 runtime”。bridge 内部提供一个公开的 `redetect()`：

1. 立即解析当前 top runtime。
2. 未找到时保持 `offline`。
3. 找到但 owner/session 尚未满足寒冬契约时进入 `unavailable`，并订阅 runtime `status` 等待现有延迟就绪流程。
4. owner/session 均匹配时 attach host bridge、订阅未读并进入 `available`。
5. runtime 实例发生变化时，先释放旧实例上的 status、unread 和 host bridge，再绑定新实例。
6. bridge dispose 后释放 runtime-installed 事件和全部运行时监听；后续事件或手动检测不再生效。

自动安装事件和手动按钮都只调用 `redetect()`，避免两套恢复状态机。

## 5. Beta 手动诊断

Beta 面板顶部新增独立的 `PHONE BRIDGE` 诊断区：

- 展示 `offline / unavailable / available` 对应的中文状态。
- 提供“重新检测手机”按钮。
- 点击后由 `StoryPagePre` 调用 bridge `redetect()`；Beta 组件只发出事件，不直接访问 top runtime。
- 检测结果追加到现有 Beta action log，并同步到 Pre gallery log，便于之后移入系统弹窗时复用。

手机 bridge 的所有权仍在 `StoryPagePre`；Beta 只是临时展示位置。

## 6. 默认主题移动端按钮

在现有移动端断点内，仅对非 Apple 默认主题隐藏手机入口右侧的装饰性 `.ui-bars`：

- 保留完整的“手机·离线 / 手机·不可用 / 手机·N未读”文字。
- 不改变按钮点击区域、禁用态、未读数据或桌面布局。
- Apple 系列主题已有独立工具栏视觉，保持现状。
- 不通过缩小字号或文本截断解决挤压。

## 7. 错误处理

- top window 不可访问、runtime 读取失败或 runtime 接口异常时，检测返回降级状态，不影响 Pre 阅读、输入、生成和重生。
- 安装事件监听失败不得阻断 bridge 初始化。
- 手动重复点击不得累计监听；错误只形成简短诊断，不泄露上下文或密钥。

## 8. 测试与验收

### 自动化测试

1. Pre 先创建且 runtime 缺失时初始为 `offline`。
2. runtime 后安装并派发事件后，Pre 自动变为 `available`。
3. runtime 已安装但 owner/session 延迟时，沿用 `unavailable -> available` 恢复。
4. 重复安装事件和重复手动检测只 attach/订阅一次。
5. runtime 实例更换时旧绑定完整释放。
6. dispose 后安装事件与手动检测均无副作用。
7. runtime 安装顺序为“发布全局入口 -> 派发事件”。
8. 源码测试确认移动端默认主题隐藏手机装饰条，Apple 主题不受影响。

### 现场验收

1. 全页加载时即使 Pre 先出现，手机脚本稍后进入 `READY` 后入口也自动恢复。
2. Beta 中点击“重新检测手机”会给出当前状态，重复点击无重复 Shell 或监听。
3. 默认主题窄屏下手机入口文字不再被信号条挤压。
4. 手机不可用时 Pre 原有阅读、输入、生成和重生均正常。

## 9. 非目标

- 不修改角色卡七脚本清单或 CDN URL。
- 不增加定时轮询、刷新页面或自动重载 Pre。
- 不把 PhoneDB、AI、ChatLore、MVU 或手机路由导入 Pre。
- 本次不把 Beta 按钮正式迁入系统弹窗；只保持便于后续搬迁的事件边界。
