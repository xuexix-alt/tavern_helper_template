---
name: zodmvu变量书写和校验修改
description: 根据当前仓库里的 @types、示例与 MVU/Zod 运行时桥接实现，书写、校验、修改角色卡变量结构及相关世界书文件
---

# Zod MVU 变量书写和校验修改

用于处理以下任务：

- 新建或重构 `schema.ts`
- 校验 MVU 变量结构是否和当前项目架构一致
- 修改 `[mvu_update]变量更新规则.yaml`、`[mvu_update]变量输出格式.yaml`、`[initvar]*`
- 编写或修订 `脚本/变量结构/index.ts`
- 编写读取/写回 `stat_data` 的界面、脚本、store

这份 skill 已按 **当前仓库（2026-03-10）中的 `@types`、示例代码、`util/mvu.ts`、`tmp_mvu_zod.js`，以及官方 MVU 插件源码** 进行了修订。

## 先看什么

处理任务时，按下面顺序取证，不要直接凭旧记忆下结论：

1. `@types/iframe/exported.mvu.d.ts`
2. `@types/function/global.d.ts`
3. `@types/function/variables.d.ts`
4. `示例/角色卡示例/脚本/变量结构/index.ts`
5. `示例/角色卡示例/界面/状态栏/index.ts`
6. `util/mvu.ts`
7. 当前项目自己的 `schema.ts` 与 `[mvu_update]*`
8. `tmp_mvu_zod.js` 或远程 `tavern_resource/dist/util/mvu_zod.js`
9. 如仍有冲突，再看官方 MVU 插件源码（`MagVarUpdate/src/export_globals.ts`）

如果本地 `@types`、示例、运行时源码彼此冲突：

- **项目内 TypeScript 编码时优先以本地 `@types` 为准**
- **解释真实运行行为时，以示例和运行时源码为准**
- 若要使用本地 `@types` 未声明的方法，必须先说明是“运行时额外能力”，并在代码里做 `typeof ... === 'function'` 守卫

## 当前架构速记

### 1. `stat_data` 才是真正的业务数据

- MVU 数据的核心内容放在 `MvuData.stat_data`
- 读取时通常是：`_.get(Mvu.getMvuData(...), 'stat_data', {})`
- Zod Schema 通常描述的是 **`stat_data` 的结构**，不是整个 `MvuData`

### 2. 当前本地 `@types` 暴露的 MVU 主接口

来自 `@types/iframe/exported.mvu.d.ts`：

- `Mvu.getMvuData(options)`
- `Mvu.replaceMvuData(mvu_data, options)`
- `Mvu.parseMessage(message, old_data)`
- `Mvu.isDuringExtraAnalysis()`
- `Mvu.events.VARIABLE_INITIALIZED`
- `Mvu.events.VARIABLE_UPDATE_STARTED`
- `Mvu.events.COMMAND_PARSED`
- `Mvu.events.VARIABLE_UPDATE_ENDED`
- `Mvu.events.BEFORE_MESSAGE_UPDATE`

### 3. 当前 `MvuData` 结构

本地 `@types` 中的定义是：

```ts
type MvuData = {
  initialized_lorebooks: Record<string, any[]>;
  stat_data: Record<string, any>;
  [key: string]: any;
};
```

注意：

- **不是** `initialized_lorebooks: string[]`
- `initialized_lorebooks` 已升级为以世界书名为键的映射结构

### 4. 当前 `CommandInfo` 已包含 `move`

本地 `@types` 中，`Mvu.CommandInfo` 包含：

- `set`
- `add`
- `insert`
- `delete`
- `move`

并且 `args` 在类型层面是 **字符串字面量**，而不是已经完成 JS 解析的值。

### 5. 启动顺序

凡是使用 `Mvu` 的脚本或界面，都先做：

```ts
await waitGlobalInitialized('Mvu');
```

如果是消息楼层 iframe 界面，再额外参考现有示例：

```ts
await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'));
```

也就是说：

- `waitGlobalInitialized('Mvu')` 是等待全局接口可用
- `waitUntil(...stat_data...)` 是等待当前楼层变量真正到位

这两个等待解决的是 **不同问题**，不要混为一谈。

## 重要兼容性说明

### 1. `reloadInitVar` 的现实情况

当前仓库本地 `@types/iframe/exported.mvu.d.ts` **没有声明** `Mvu.reloadInitVar`。

但官方 MVU 插件源码当前仍包含该运行时方法。

因此：

- 在 **项目内 TypeScript 代码** 中，不要把它当作“已有类型”的稳定接口直接写死
- 如果用户明确要用它，先说明这是 **运行时存在、本地类型未同步** 的能力
- 代码必须写成：

```ts
await waitGlobalInitialized('Mvu');
const mvuData = Mvu.getMvuData({ type: 'message', message_id: getCurrentMessageId() });

if (typeof (Mvu as any).reloadInitVar === 'function') {
  await (Mvu as any).reloadInitVar(mvuData);
}
```

### 2. `parseMessage` 的返回值要写兼容代码

本地 `@types` 把 `Mvu.parseMessage(...)` 标成 `Promise<Mvu.MvuData>`。

但仓库内已有实际代码会把它当成 `Mvu.MvuData | undefined` 来防御式处理。

因此，写健壮代码时建议：

```ts
const parsed = await Mvu.parseMessage(messageText, _.cloneDeep(baseMvuData));
const nextMvuData = parsed ?? baseMvuData;
```

### 3. `registerVariableSchema` 和 `registerMvuSchema` 不是一回事

- `registerVariableSchema(...)` 是酒馆助手变量管理器的结构注册接口，来自 `@types/function/variables.d.ts`
- `registerMvuSchema(...)` 是外部 `mvu_zod.js` 提供的桥接器

当前桥接器会做两件事：

1. 自动把 `schema` 包成 `z.object({ stat_data: schema })` 后注册到变量管理器
2. 监听 zod 专用的 MVU 事件，在变量更新链路中做 `safeParse`、纠偏和报错提示

补充：当前 `mvu_zod.js` 对传入的顶层 `ZodObject` 会先按 `z.looseObject(schema.shape)` 处理，再用于注册和校验；因此你不能假设“顶层 strict 约束会被原样保留到桥接器里”。

## 两层命令模型一定要分清

当前 Zod MVU 架构里，**最容易写错的地方就是把“AI 输出层”与“运行时层”混在一起**。

### A. AI / 世界书输出层

`[mvu_update]变量更新规则.yaml`、`[mvu_update]变量输出格式.yaml` 里，当前项目主流仍在使用 **JSON Patch 风格操作名**：

- `replace`
- `delta`
- `insert`
- `remove`
- `move`

例如：

```json
[
  { "op": "replace", "path": "/世界/时间", "value": "夜间 - 21:30" },
  { "op": "delta", "path": "/纪宁/Imp", "value": 8 },
  { "op": "insert", "path": "/临时NPC/陌生拾荒者", "value": { "姓名": "陌生拾荒者" } }
]
```

但要注意：**路径前缀是否带 `/stat_data` 必须看当前项目已有文件，不要想当然。**

- `src/寒冬末日/世界书/变量/[mvu_update]变量输出格式.yaml`：路径以 `stat_data` 根为语义起点，示例是 `/世界/时间`
- `src/APP后台版/变量/[mvu_update]变量更新规则.yaml`：明确要求路径带 `/stat_data/...`

结论：

- **修订世界书模板时，必须沿用该项目现有的路径约定**
- 不要把一个项目的前缀规则机械复制到另一个项目

### B. 运行时 / TypeScript / 事件层

`Mvu.parseMessage(...)`、`Mvu.events.COMMAND_PARSED` 和 `tmp_mvu_zod.js` 里处理的是 **内部命令模型**：

- `set`
- `add`
- `insert`
- `delete`
- `move`

可以用下面的映射关系理解：

| AI 输出层 | 运行时层 |
|---|---|
| `replace` | `set` |
| `delta` | `add` |
| `insert` | `insert` |
| `remove` | `delete` |
| `move` | `move` |

因此：

- 写 **世界书输出规则** 时，用项目既有的 JSON Patch 风格
- 写 **TypeScript 事件处理 / `Mvu.CommandInfo` 解释** 时，用 `set/add/insert/delete/move`
- 不要把 `replace` 误写成 `Mvu.CommandInfo['type']`
- 也不要把 `set` 直接塞进 `[mvu_update]变量输出格式.yaml`

## 现行 Schema 书写规则

### 1. 根 Schema 的形状

常用形式：

```ts
import { z } from 'zod';

export const Schema = z.object({
  世界: z.object({}).prefault({}),
  角色A: z.object({}).prefault({}),
});

export type Schema = z.output<typeof Schema>;
```

但不要死背“顶层必须写死角色名”。

当前仓库已经存在 **可扩展顶层动态键** 方案，例如：

```ts
const createExtensibleMapSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.looseObject({}).catchall(itemSchema).prefault({});
```

以及：

```ts
z.object({
  世界: 世界Schema,
  庇护所: 庇护所Schema,
  临时NPC: createExtensibleMapSchema(临时NPCSchema),
}).catchall(主要角色Schema);
```

也就是说，**“顶层动态角色对象”已经是现行做法之一**。

### 2. `prefault()` 仍然是 MVU 主线的首选

对于会被反复解析、反复写回、需要保证结构稳定的 `stat_data`：

- 优先用 `z.prefault(...)`
- 让 `Schema.parse({})` 尽可能能直接产出完整结构

但不要把这条规则绝对化：

- 在 `src/流式最小Demo/shared/opening.schema.ts` 这类 **表单 / 载荷 / 非核心 MVU 持久层** 中，`default()` 也是现存做法
- 因此你要先判断：当前文件是 **MVU 持久变量结构**，还是普通表单配置结构

### 3. `array` 不是禁用项

旧说法“优先使用 `record()` 而不是 `array()`”已经不够准确。

当前仓库中大量使用了数组，而且是合理的：

- `selected_roles: z.array(z.string()).prefault([])`
- `revealed_roles: z.array(z.string()).prefault([])` 这类有序列表
- 房间入住者、能力列表、标签列表、表单项列表

判断原则：

- **顺序重要 / 允许重复 / 追加语义明显**：用 `z.array(...)`
- **按键查找 / 稳定映射 / 动态对象集合**：用 `z.record(...)` / `z.partialRecord(...)` / `catchall(...)`

### 4. 固定对象 vs 可扩展对象

- 固定结构的子对象，可以用 `.strict()`
- 需要接纳未来动态键的对象，优先用：
  - `z.record(...)`
  - `z.partialRecord(...)`
  - `z.looseObject({}).catchall(...)`

不要把所有对象都 `.strict()`，否则以后新增动态角色或动态房间键会被你卡死。

### 5. 推荐写法

- 数字：`z.coerce.number()` / `z.coerce.number().int()`
- 布尔：`z.boolean()`，不要滥用 `z.coerce.boolean()`
- 字符串归一化：优先 `z.preprocess(...)`
- 数值约束：`transform(v => _.clamp(v, min, max))`
- 可选但希望有稳定默认结构：优先 `prefault(...)`
- 派生/辅助字段：沿用当前项目习惯，可用 `$` 前缀，例如 `$meta`

### 6. 幂等性要求

对 MVU Schema 的 `transform` / `preprocess`，尽量满足：

```ts
Schema.parse(Schema.parse(input)) === Schema.parse(input)
```

例如：

- clamp
- 别名归一化
- 房间号标准化
- 时间字符串标准化

这类是安全的。

## 代码模板

### 模板 1：注册 MVU Schema 的脚本

```ts
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
import { Schema } from '../../schema';

$(() => {
  registerMvuSchema(Schema);
});
```

兼容写法也允许：

```ts
registerMvuSchema(() => Schema);
```

适用于 Schema 需要延迟求值的场景。

### 模板 2：消息楼层界面启动

```ts
import App from './App.vue';

async function waitUntil(
  predicate: () => boolean,
  { intervalMs = 50, timeoutMs = 5000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil timeout');
    await new Promise<void>(resolve => setTimeout(resolve, intervalMs));
  }
}

$(async () => {
  await waitGlobalInitialized('Mvu');
  await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'));
  createApp(App).use(createPinia()).mount('#app');
});
```

### 模板 3：读取当前楼层 `stat_data`

```ts
await waitGlobalInitialized('Mvu');

const messageId = getCurrentMessageId();
const mvuData = Mvu.getMvuData({ type: 'message', message_id: messageId });
const statData = Schema.parse(_.get(mvuData, 'stat_data', {}));
```

### 模板 4：修改后写回

```ts
await waitGlobalInitialized('Mvu');

const messageId = getCurrentMessageId();
const mvuData = Mvu.getMvuData({ type: 'message', message_id: messageId });

_.set(mvuData, 'stat_data.世界.时间', '夜间 - 21:30');

await Mvu.replaceMvuData(mvuData, { type: 'message', message_id: messageId });
```

### 模板 5：手动解析 AI 文本里的 MVU 更新

适用于 `generate()` 等不会自动触发新楼层解析的场景。

```ts
await waitGlobalInitialized('Mvu');

const messageId = getCurrentMessageId();
const oldData = Mvu.getMvuData({ type: 'message', message_id: messageId });
const aiText = await generate({ user_input: '继续剧情并更新变量' });

const parsed = await Mvu.parseMessage(String(aiText ?? ''), _.cloneDeep(oldData));
const nextData = parsed ?? oldData;

await Mvu.replaceMvuData(nextData, { type: 'message', message_id: messageId });
```

### 模板 6：可选的 `reloadInitVar` 兼容写法

```ts
await waitGlobalInitialized('Mvu');

const messageId = getCurrentMessageId();
const mvuData = Mvu.getMvuData({ type: 'message', message_id: messageId });

if (typeof (Mvu as any).reloadInitVar === 'function') {
  await (Mvu as any).reloadInitVar(mvuData);
}
```

### 模板 7：基于 `util/mvu.ts` 的 Pinia store

```ts
import { defineMvuDataStore } from '@/util/mvu';
import { Schema } from '../../schema';

export const useDataStore = defineMvuDataStore(Schema, {
  type: 'message',
  message_id: getCurrentMessageId(),
});
```

注意：

- `util/mvu.ts` 会把 `message_id: 'latest'` 规范成 `-1`
- 它会双向同步 `data <-> variables.stat_data`
- 它会对读出来的数据做 `safeParse`，校验失败时忽略该轮同步

### 模板 8：监听 MVU 事件

```ts
await waitGlobalInitialized('Mvu');

eventOn(Mvu.events.VARIABLE_INITIALIZED, (variables, swipeId) => {
  console.log('初始化完成', swipeId, variables);
});

eventOn(Mvu.events.VARIABLE_UPDATE_STARTED, variables => {
  console.log('更新开始', variables);
});

eventOn(Mvu.events.COMMAND_PARSED, (variables, commands, messageContent) => {
  console.log('命令已解析', commands, messageContent);
});

eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (variables, oldVariables) => {
  console.log('更新结束', variables, oldVariables);
});

eventOn(Mvu.events.BEFORE_MESSAGE_UPDATE, ({ variables, message_content }) => {
  console.log('即将写回楼层', variables, message_content);
});
```

## 校验流程

### 创建新结构时

1. 先确定目标文件属于：
   - MVU 持久变量 `schema.ts`
   - 表单/载荷 schema
   - 世界书 `[mvu_update]*`
   - 注册脚本
   - 界面/store 消费层
2. 先读同项目已有 Schema 和世界书，不要跨项目生搬硬套
3. 确认路径前缀风格：`/世界/时间` 还是 `/stat_data/世界/时间`
4. 只做与当前任务有关的最小改动

### 校验现有结构时

至少检查下面几项：

- `schema.ts` 是否能 `Schema.parse({})` 或 `safeParse({})` 产出稳定结构
- 数字、布尔、字符串归一化是否符合现有项目风格
- 顶层与动态键策略是否正确
- `变量结构/index.ts` 是否真的注册了该 Schema
- 世界书更新规则和输出格式是否匹配该 Schema
- UI / store 是否从 `stat_data` 读取而不是误读整个变量表
- 是否错误引用了本地 `@types` 中不存在的方法

## 一定要避免的旧结论

以下说法现在都不应再直接写进回答或技能：

- “`initialized_lorebooks` 是 `string[]`”
- “`Mvu.CommandInfo` 没有 `move`”
- “`reloadInitVar` 在本地 `@types` 里已经声明好了”
- “MVU Zod 主线只用 JSON Patch，不涉及内部 `set/add/insert/delete/move`”
- “永远优先 `record()`，不要用 `array()`”
- “所有对象都应该 `.strict()`”
- “所有字段都必须 `prefault()`，不能出现 `default()`”

## 输出时的表达建议

给用户回复时，优先按下面顺序组织：

1. 先说明你对照了哪些真源：`@types` / 示例 / 运行时桥接 / 官方源码
2. 再指出哪些地方升级了或和旧说法不一致
3. 最后给出最小改动方案

如果用户是让你“修技能文档”而不是“修业务代码”，就优先修这份 skill，把升级点写清楚，不要只在聊天里口头说明。
