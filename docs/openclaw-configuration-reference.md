# OpenClaw 配置参考文档

本文档详细说明了 `~/.openclaw/openclaw.json` 配置文件的所有字段。该配置使用 JSON5 格式，支持注释和尾随逗号。所有字段均为可选项，OpenClaw 会在省略时使用安全默认值。

---

## 一、频道配置 (Channels)

每个频道在其配置部分存在时自动启动（除非设置 `enabled: false`）。

### 1.1 DM 和群组访问策略

**DM 策略 (dmPolicy):**

| 值 | 说明 |
|---|---|
| `pairing` (默认) | 未知发送者获得一次性配对码；所有者需批准 |
| `allowlist` | 仅允许来自 `allowFrom` 或已配对存储的发送者 |
| `open` | 允许所有入站 DM（需设置 `allowFrom: ["*"]`） |
| `disabled` | 忽略所有入站 DM |

**群组策略 (groupPolicy):**

| 值 | 说明 |
|---|---|
| `allowlist` (默认) | 仅允许匹配的群组 |
| `open` | 绕过群组允许列表（提及限制仍适用） |
| `disabled` | 阻止所有群组/房间消息 |

> 配对码有效期为 1 小时。每个频道的待处理 DM 配对请求上限为 3 个。

### 1.2 频道模型覆盖

使用 `channels.modelByChannel` 可将特定频道 ID 绑定到指定模型。

### 1.3 频道默认值和心跳

- `groupPolicy`: 提供商级别未设置时的后备群组策略
- `heartbeat.showOk`: 在心跳输出中包含健康状态
- `heartbeat.showAlerts`: 包含降级/错误状态

### 1.5 Telegram 常用字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用 |
| `botToken` | string | - | Bot令牌 |
| `dmPolicy` | string | `"pairing"` | DM策略 |
| `allowFrom` | array | `[]` | 允许的发送者列表 |
| `groupPolicy` | string | `"allowlist"` | 组策略 |
| `streaming` | string | `"off"` | 流式模式 |
| `replyToMode` | string | `"first"` | 回复模式 |
| `historyLimit` | number | `50` | 历史消息限制 |
| `linkPreview` | boolean | `true` | 启用链接预览 |
| `actions.reactions` | boolean | `true` | 启用反应 |
| `actions.sendMessage` | boolean | `true` | 启用发送消息 |
| `mediaMaxMb` | number | `5` | 媒体最大MB数 |

---

## 二、代理默认配置 (Agent Defaults)

### 2.1 工作区和工作目录

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `workspace` | string | `"~/.openclaw/workspace"` | 默认工作区目录 |
| `repoRoot` | string | - | 仓库根目录 |
| `skipBootstrap` | boolean | `false` | 跳过自动创建引导文件 |

### 2.2 模型配置

| 字段 | 类型 | 说明 |
|------|------|------|
| `model.primary` | string | 主要模型（格式：provider/model） |
| `model.fallbacks` | array | 备用模型列表 |
| `models.<provider/model>.alias` | string | 模型别名 |
| `thinkingDefault` | string | 默认思考级别 |
| `verboseDefault` | string | 默认详细模式 |
| `elevatedDefault` | string | 默认提权模式 |
| `timeoutSeconds` | number | 超时秒数 |
| `contextTokens` | number | 上下文token数 |

### 2.3 压缩配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `compaction.mode` | string | `"safeguard"` | 模式 |
| `compaction.reserveTokensFloor` | number | `24000` | 保留token下限 |

---

## 三、会话配置 (Session)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `scope` | string | `"per-sender"` | 作用域 |
| `dmScope` | string | `"main"` | DM作用域 |
| `reset.mode` | string | `"daily"` | 重置模式 |
| `reset.atHour` | number | `4` | 每日重置小时 |

**dmScope 选项:**
- `main`: 所有DM共享一个会话
- `per-peer`: 每个发送者独立会话
- `per-channel-peer`: 每个频道+发送者独立会话
- `per-account-channel-peer`: 考虑账户的独立会话

---

## 四、命令配置 (Commands)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `native` | string/boolean | `"auto"` | 注册原生命令 |
| `nativeSkills` | string/boolean | `"auto"` | 启用原生技能 |
| `text` | boolean | `true` | 解析聊天中的 /命令 |
| `bash` | boolean | `false` | 允许 ! 命令 |
| `restart` | boolean | `false` | 允许 /restart 命令 |

---

## 五、钩子配置 (Hooks)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用 |
| `token` | string | - | 共享密钥 |
| `path` | string | `"/hooks"` | 路径 |

---

## 六、技能配置 (Skills)

| 字段 | 类型 | 说明 |
|------|------|------|
| `allowBundled` | array | 允许的捆绑技能 |
| `install.nodeManager` | string | 节点管理器 |

---

## 七、工具配置 (Tools)

| 字段 | 类型 | 说明 |
|------|------|------|
| `profile` | string | 工具配置文件 |

**工具配置文件:**

| 配置文件 | 包含工具 |
|---------|---------|
| `minimal` | session_status |
| `coding` | group:fs, group:runtime, group:sessions, group:memory, image |
| `messaging` | group:messaging, sessions_* |
| `full` | 无限制 |

---

## 八、网关配置 (Gateway)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mode` | string | `"local"` | 模式 |
| `port` | number | `18789` | 端口 |
| `bind` | string | `"loopback"` | 绑定模式 |
| `auth.mode` | string | `"token"` | 认证模式 |
| `auth.token` | string | - | 令牌 |
| `tailscale.mode` | string | `"off"` | Tailscale模式 |

---

## 完整字段参考

更多字段详见官方文档：https://docs.openclaw.ai/gateway/configuration-reference.md
