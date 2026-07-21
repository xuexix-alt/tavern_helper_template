# 寒冬小手机延迟 Owner 就绪修复设计

## 问题

`00运行时管理器` 可以先于其余模块创建 `window.top.TavernPhone`，而 `winter.adapter` 必须等待平台服务、数据、AI、外壳和 APP 模块齐全后才能初始化并设置 owner/session。same-layer pre 挂载时因此可能看到“运行时存在但 owner 尚未就绪”。

当前 `createPrePhoneBridge()` 只在创建瞬间检查一次 owner。初次不匹配时，它将状态设为 `unavailable`，且不订阅运行时 `status` 事件；适配器之后调用 `setOwner()`、`setSession()` 也无法让 UI 恢复，入口会永久停在“手机·不可用”。

源码中的 `\uXXXX` 每个只有一个反斜杠，会被 TypeScript 正确解析成中文，不是故障原因。

## 修复

- 运行时存在时始终订阅 `status`，即使初始 owner 尚未匹配。
- 每次 `status` 更新都重新检查 owner，并尝试挂接 host bridge。
- `setOwner()` 后 session 尚未设置导致挂接失败时保持 `unavailable`；下一次 `setSession()` 状态事件再次尝试并恢复为 `available`。
- 成功挂接后只注册一次 unread 监听，避免重复监听与重复 detach。
- owner 后续失配或 bridge dispose 时，清理 host bridge 与 unread 监听。
- 保留角色名、adapterId、runtimeMajor 三字段严格校验，不允许其他角色卡接管。

## 验证与发布

- 假运行时按真实顺序从 `owner=null/session=false` 变为 owner 匹配但无 session，再变为 owner/session 都就绪。
- 旧实现必须在该测试中保持 `unavailable`，证明回归测试能捕获截图问题。
- 修复后最终状态必须为 `available`，且 attach、unread 订阅与 detach 次数均为一次。
- owner 永久失配、运行时缺失和运行时抛错的现有降级行为继续通过。
- 重新构建 same-layer pre production 产物，推送到 `20260211` 并刷新 CDN 缓存。
