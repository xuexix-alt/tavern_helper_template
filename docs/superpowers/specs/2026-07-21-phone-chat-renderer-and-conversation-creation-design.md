# 小手机聊天渲染与显式建会话设计

## 背景

当前小手机可以注册并打开“微信”图标，但手机主程序只渲染 APP 标题栏和空的内容容器。聊天 APP 监听 `app-opened` 后，通过 `#phone-entry-btn` 的相邻节点或第一个 `iframe[script_id]` 猜测手机 iframe，再尝试跨文档挂载 Vue。这条链路不稳定，也偏离参考卡中由 `PhoneSystem.registerRenderer()` 统一管理 APP 渲染的契约。

聊天数据库已经提供 `createConversation()`，但聊天 APP 没有创建入口。用户明确要求不自动创建任何会话：空数据库继续显示“暂无聊天记录”，由用户显式新建私聊或群聊。角色姓名候选来自 `{{format_message_variable::stat_data}}` 展开结果的根级键名。

## 目标

1. 由 `PhoneSystem` 准确持有手机 iframe、APP 内容容器和渲染生命周期。
2. 聊天 APP 通过稳定的 renderer 契约挂载，不再查询或猜测父页面 iframe。
3. 空数据库保持原有空状态，同时提供“新建私聊/群聊”入口。
4. 会话候选姓名取自 `substitudeMacros('{{format_message_variable::stat_data}}')` 展开结果的根级键名。
5. 切换酒馆聊天文件后保留小手机入口，并让聊天数据库和聊天界面切换到新 `chatId` 的数据分区。

## 非目标

- 不自动为任何角色建立会话。
- 不修改聊天副 API 提示词、ChatCore 回复内容逻辑或 ChatSync 的 ChatLore 回写规则；只允许增加聊天切换所需的中止与防抖取消接口。
- 不迁移或清空现有 `TenantChatDB` 数据。
- 不把聊天 APP 合并进小手机主程序。
- 不为其他尚未移植的手机 APP 实现业务界面。

## 方案选择

采用中心化渲染器契约：`PhoneSystem` 保存 APP 元数据与 renderer，负责在手机 iframe 内创建容器、调用 renderer 和执行清理。聊天 APP 只注册图标与 renderer。

不采用以下方案：

- 不继续依赖 `app-opened` 后自行查找 iframe，因为 DOM 邻接关系和通用 `iframe[script_id]` 选择器不能唯一标识手机 iframe。
- 不把聊天 APP 合并到主程序，因为这会破坏手机壳与业务 APP 的模块边界。

## 组件与接口

### PhoneSystem 渲染器注册表

新增 renderer 类型：

```ts
interface PhoneRendererContext {
  container: HTMLElement;
  vue: typeof import('vue');
}

type PhoneAppCleanup = () => void;
type PhoneAppRenderer = (context: PhoneRendererContext) => void | PhoneAppCleanup;
```

`PhoneSystem` 新增公开接口：

```ts
registerRenderer(appId: string, renderer: PhoneAppRenderer): void;
unregisterRenderer(appId: string): void;
openApp(appId: string): boolean;
goHome(): void;
getContextGeneration(): number;
```

约束：

- APP 元数据注册表必须是 Vue 响应式集合；手机桌面已经挂载后再调用 `registerApp()`，图标也必须立即出现。重复注册同一 `appId` 时原位替换元数据，不产生重复图标。
- `registerRenderer` 可以先于或晚于手机 iframe 打开。若对应 APP 正在显示，晚注册必须立即安排挂载。
- 重复注册同一 `appId` 表示热重载替换：先把旧实例 cleanup 恰好一次，再在仍显示该 APP 时挂载新 renderer。
- `unregisterRenderer` 删除 renderer；若对应 APP 正在显示，先 cleanup 恰好一次，再显示“APP 尚未就绪”，但保留标题栏和返回桌面能力。
- `openApp` 只接受已经注册到桌面的 `appId`。未注册时返回 `false` 且不改变当前状态；已注册时确保手机 iframe 已创建并可见、切换当前 APP、安排挂载并返回 `true`。
- 若 `openApp` 接收的 `appId` 已经是当前挂载的 APP，只确保手机可见并返回 `true`，保留现有实例和状态，不 cleanup 或重复挂载。
- `goHome` 在手机尚未创建或已经位于桌面时是安全的无操作；在 APP 内页时 cleanup 恰好一次并回到桌面。
- APP 内容容器由手机主程序创建，renderer 不读取父页面 iframe 列表。
- 切换 APP、返回桌面、关闭手机或卸载脚本时，主程序必须调用当前 renderer 返回的 cleanup，且同一实例只清理一次。
- 重复打开同一个 APP 时不得叠加多个 Vue 实例。
- renderer 不存在时显示可见的“APP 尚未就绪”，而不是空白容器。
- renderer 必须在内部捕获挂载过程错误、回滚自己已创建的资源后再抛出；控制器捕获错误、清空内容容器并显示“APP 加载失败”。cleanup 抛错只记录日志，不阻止状态切换。聊天 renderer 若 `app.mount()` 抛错，会尝试 `app.unmount()` 后再向控制器抛出。
- 每次安排 `nextTick` 挂载都携带递增 generation。回调执行时必须再次核对 generation、当前 `appId`、renderer 身份和容器连接状态；过期回调直接退出，避免快速切换导致旧 APP 反向挂载。

入口按钮再次点击已显示的手机时只执行 `iframe.hide()`，不 cleanup 当前 renderer；再次显示同一个 iframe 时保留当前 APP 和组件状态，不重新挂载。返回桌面、切换 APP、聊天文件切换和脚本卸载才执行 cleanup。这里的“关闭手机”专指完整卸载，不指入口按钮的临时隐藏。

renderer 生命周期状态机提取到纯逻辑控制器，向控制器注入调度函数与容器获取函数。真实 `PhoneDesktop` 只负责响应式视图与调用控制器，使晚注册、替换、反注册、快速切换和 cleanup 恰好一次可以脱离真实 iframe 做单元测试。

### 聊天 APP renderer

聊天 APP 调用：

```ts
PhoneSystem.registerApp(chatAppMetadata);
PhoneSystem.registerRenderer('chat-app', ({ container, vue }) => {
  const app = vue.createApp(ChatAppComponent);
  app.mount(container);
  return () => app.unmount();
});
```

聊天 APP 删除以下行为：

- 监听 `app-opened` 后猜测手机 iframe。
- 使用 `nextElementSibling` 或 `querySelector('iframe[script_id]')`。
- 定时重试等待猜测出来的挂载点。
- 从 `window.parent.Vue` 获取 Vue 运行时。

聊天 APP 在自身 `pagehide` 时调用 `unregisterRenderer('chat-app')` 并取消尚未完成的 PhoneSystem 等待。等待过程使用可取消的计时器和 disposed 标志；脚本卸载后不得继续轮询或重新注册旧闭包。

### stat_data 姓名候选解析

新增纯函数模块负责解析候选，输入是宏展开后的文本，输出判别联合：

```ts
type StatDataRootNameResult =
  | { ok: true; names: string[] }
  | {
      ok: false;
      reason: 'source-error' | 'macro-unexpanded' | 'parse-error' | 'not-object' | 'empty';
    };

parseStatDataRootNames(expanded: string): StatDataRootNameResult;
```

规则：

1. 数据源必须通过 `substitudeMacros('{{format_message_variable::stat_data}}')` 获取。
2. 使用仓库已有 `yaml` 依赖解析宏返回的结构化文本。
3. `substitudeMacros()` 抛错映射为 `source-error`。宏调用由 UI 数据源适配器捕获，纯解析函数本身只接收字符串。
4. 对宏结果执行 `trim()`；空文本，或仍包含字面量 `{{format_message_variable::stat_data}}`，判定为 `macro-unexpanded`。
5. 若文本最外层是 Markdown 围栏，允许围栏前后空白、`yaml`/`yml`/`json` 语言标签和 LF/CRLF；只移除一层完整围栏。形式为 `/^\s*```(?:ya?ml|json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i`。
6. 解析结果必须是非数组对象；候选为 `Object.keys(parsed)`。
7. 对候选执行字符串化、首尾空白清理、空值过滤和稳定去重，保持宏中的原始顺序。
8. 不根据 `世界`、`公寓` 等名称做隐式过滤；用户要求使用 `stat_data` 根列表，界面忠实展示全部根键。
9. 解析失败、结果不是对象或根列表为空时分别返回 `parse-error`、`not-object`、`empty`，创建弹窗显示对应错误且不写数据库。

## 新建会话交互

空状态与已有会话列表的右上角都显示“＋”按钮。点击后打开聊天 APP 内部的模态面板。

每次打开弹窗都重新展开宏并刷新候选，不缓存上次 `stat_data`。这样新加入或移除的根键会立即反映在选择列表中。

### 私聊

- 用户选择“私聊”后只能选择一个根级姓名。
- 确认时重新调用 `getConversations()`，成功读取当前 `chatId` 分区后，检查是否已有 `type === 'private'` 且 `members[0]` 等于该姓名的会话。不能只依赖可能陈旧的本地列表。
- 查重读取失败时保留弹窗并显示错误，禁止调用 `createConversation()`；只有成功确认不存在时才能创建。
- 若已有，关闭弹窗并直接打开已有会话。
- 若没有，调用 `ChatDB.createConversation({ type: 'private', members: [name], name })`，使用返回值立即更新本地列表并打开新会话，再进行非阻塞列表刷新。

### 群聊

- 用户选择“群聊”后可以多选，至少选择两个不同姓名。
- 默认群名为所选姓名使用“、”连接后的文本；弹窗允许用户修改群名。
- 群名执行 `trim()` 后为空时回退到默认群名。
- 每次确认显式创建新群聊；不同时间可以创建相同成员组合的多个群聊。
- 创建后使用返回值立即更新本地列表并打开新会话，再进行非阻塞列表刷新。

### 错误与忙碌状态

- 候选加载时禁用确认按钮并显示加载状态。
- 宏解析失败时显示本地错误文案，不调用 `createConversation()`。
- 数据库创建失败时保留弹窗选择，显示错误，允许重试。
- 创建进行中禁用重复提交。
- `createConversation()` 一旦返回即视为创建成功。界面使用返回的会话直接更新本地列表并进入会话；随后刷新列表若失败，只显示非阻塞的“列表刷新失败”提示，不重新开放同一次提交，也不重复调用创建，避免重复群聊。
- 关闭弹窗会清空模式、选择、群名和错误状态。

初次 `getConversations()` 具有独立的 `loading | ready | error` 状态。只有成功返回空数组才显示“暂无聊天记录”；失败时显示“聊天记录加载失败”和重试按钮，不能伪装为空数据库。

## 数据与事件流

```text
点击微信图标
  -> PhoneSystem.openApp('chat-app')
  -> PhoneDesktop 渲染准确的 app-content-chat-app
  -> Vue nextTick
  -> PhoneSystem 调用已注册 renderer
  -> 聊天 Vue 实例挂载

点击“＋”
  -> substitudeMacros('{{format_message_variable::stat_data}}')
  -> YAML 解析根对象
  -> 根键姓名选择
  -> ChatDB.createConversation(...)
  -> 使用创建返回值打开所选会话
  -> 后台 getConversations() 刷新列表
```

手机聊天发送、ChatCore 生成和 ChatSync 回写保持现有链路不变。

## 酒馆聊天切换生命周期

- `CHAT_CHANGED` 后不调用会移除入口按钮的永久 `destroy()`。
- 主程序递增会话 generation，先发出 `chat-context-changed` 事件，payload 固定为 `{ chatId: string, generation: number }`，再关闭当前 APP renderer、隐藏手机面板并保留入口按钮。
- `PhoneSystem.getContextGeneration()` 同步返回当前 generation。聊天 APP 的每次异步操作在开始时读取并保存该值，返回时再次读取比较；renderer cleanup 还会把组件局部 disposed 标志置为真。任一条件失效都不得更新 UI 或发起后续步骤。
- ChatDB 不再让单次操作在异步过程中反复读取共享 `currentChatId`。每个公开 CRUD 操作在函数同步入口调用 `beginOperation()`：立即从 SillyTavern 上下文快照 `chatId`，并获得 `{ chatId, dbPromise }` 局部上下文；该操作之后的索引查询、对象构造和事务全部使用这个局部 `chatId`，不受其他操作或 `CHAT_CHANGED` 修改共享展示状态的影响。
- `currentChatId` 只表示最近一次开始操作时的诊断状态，不能作为正在运行事务的分区来源。旧操作已经取得的局部上下文始终写旧分区；切换后开始的新操作使用新分区。
- 聊天 APP 下次打开时重新调用 `getConversations()`，因此只显示新 `chatId` 分区中的会话。
- 聊天 APP 的候选加载、会话创建和消息发送都捕获开始时的会话 generation；异步返回时 generation 不匹配则丢弃 UI 结果。已成功写入旧分区的会话或用户消息保留在旧分区，不投射到新界面。
- 切换时调用 `ChatCore.abort()` 中止进行中的副 API 回复，并取消尚未执行的 ChatSync 防抖任务；为此 ChatSync 增加 `cancelPending()`，只清除计时器，不修改已经写入的数据。
- `CHAT_CHANGED` 的监听返回句柄保存在主程序内；`pagehide` 完整卸载时注销该句柄，并移除入口、手机 iframe、Vue 实例和其他事件监听。

## 测试策略

### 纯逻辑单元测试

- YAML/JSON 风格宏结果能提取根键并保持顺序。
- 代码围栏会被移除。
- 未展开宏、非法 YAML、数组、空对象分别返回明确失败原因。
- 宏数据源适配器在 `substitudeMacros()` 抛错时返回 `source-error`。
- 私聊查重能复用已有会话。
- 群聊少于两名成员不能提交。
- renderer 控制器覆盖：先注册/后打开、先打开/后注册、重复注册替换、反注册当前 APP、快速切换使旧回调失效、返回桌面、临时隐藏/显示、renderer 异常、cleanup 异常，以及每个实例 cleanup 恰好一次。
- 重复 `openApp()` 当前 APP 保留同一实例；未注册 APP 返回 `false` 且不改变状态。
- ChatDB 并发测试覆盖：旧操作固定旧 `chatId` 后触发聊天切换，新操作使用新 `chatId`，两个事务的会话对象和索引查询不会串分区。

### 源码契约测试

- `PhoneSystem` 导出 `registerRenderer`、`unregisterRenderer`、`openApp` 和 `goHome`。
- 聊天 APP 使用 `registerRenderer('chat-app', ...)`。
- 聊天 APP 不再包含 `nextElementSibling` 和 `querySelector('iframe[script_id]')`。
- 聊天 APP 使用指定宏 `{{format_message_variable::stat_data}}`。
- `CHAT_CHANGED` 分支不执行永久卸载入口的 `destroy()`。
- APP 元数据注册表是响应式集合，晚注册图标能更新桌面。

### 构建与运行验证

- 定向 Node 测试全部通过。
- 小手机相关源码 ESLint 无错误。
- webpack 生产构建成功，并生成五个小手机脚本产物。
- 真实酒馆运行时验证：打开手机、打开微信、看到空状态、创建私聊、创建群聊、切回桌面再打开、切换酒馆聊天后入口仍存在。
- 真实运行按三种加载顺序验证：聊天脚本先加载、主程序先加载、聊天脚本热重载。
- 若当前没有可连接的酒馆浏览器，必须明确报告未完成真实运行验证，不能仅凭构建成功宣称现场问题已修复。

## 验收标准

1. 点击微信后显示完整聊天界面；renderer 未就绪时显示错误占位而不是空壳。
2. 新数据库仍显示“暂无聊天记录”，不会自动创建会话。
3. “＋”按钮可以从 `stat_data` 宏的根键创建一个私聊或至少两人的群聊。
4. 重复创建同一角色私聊时打开已有私聊，不产生重复记录。
5. 返回桌面并再次打开微信时没有重复 Vue 挂载或残留界面。
6. 切换酒馆聊天文件后小手机入口仍在，会话列表切换到对应 `chatId` 分区。
7. 原有发送消息、副 API 回复和 ChatLore 同步调用路径没有被替换。
