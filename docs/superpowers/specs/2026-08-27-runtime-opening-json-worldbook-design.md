# PRE 运行时开局 JSON 与聊天世界书同步设计

## 目标

为 `same-layer-pre` 的运行时开局表单增加 JSON 导入、导出和显式世界书同步能力。角色卡变量中的
`same_layer_pre.opening_preset`
继续作为新聊天的默认表单模板；每个聊天保存自己的 preset 快照和填写结果，并把会持续影响剧情的内容写入该聊天专属世界书。

实现逻辑属于 PRE UI，不依赖或修改小手机平台业务模块。小手机仅作为“获取当前聊天世界书并按稳定条目名幂等更新”的架构参考。

## 数据分层

### 角色卡默认模板

- 路径：角色卡变量 `same_layer_pre.opening_preset`。
- 内容：经过 `RuntimeOpeningPresetSchema` 校验的 v2 preset。
- 作用：没有聊天快照时，为新聊天提供默认表单定义。
- 导入完整 JSON 或裸 preset 后覆盖该值，使之后的新聊天使用新默认模板。

### 当前聊天 preset 快照

- 路径：聊天变量 `stream_demo.runtime_opening_preset_snapshot`。
- 内容：当前聊天实际使用的完整 v2 preset。
- 作用：切换到别的聊天并导入新 preset 后，旧聊天仍恢复自己的字段定义，不受角色卡默认模板变化影响。
- 当前聊天首次采用角色卡默认 preset 时，立即保存一份聊天快照。

### 当前聊天填写结果

- 继续使用现有 `stream_demo.opening` 的 `meta` 与 `form_values`。
- 导入时按新 preset 重建：文件中存在的答案优先，缺失字段使用 preset 的 `default_meta` 或 `default_value`，未知字段忽略。
- `select` 字段的导入答案必须出现在字段 `options` 中；否则整次导入失败，不进行部分写入。

### AI 提示词权威

- 使用 `getOrCreateChatWorldbook('current')` 获取当前聊天专属世界书。
- 条目固定名：`[同层PRE]自定义开局上下文`。
- 条目为常驻，插入位置为角色定义之前，序号为 `90`，概率为 `100`。
- 条目禁止传入和传出递归。
- 条目只包含开局任务、主角/时间/地点、已填写字段、持续导演指令和禁用事项。
- `output.content_tag`、`output.option_tag`、`output.option_count` 只约束开局生成格式，不写入常驻世界书。

## JSON 契约

完整导出包格式：

```json
{
  "format": "same-layer-pre-opening",
  "version": 1,
  "preset": {
    "version": 2,
    "preset_id": "custom-opening",
    "ui": {},
    "meta_template": {},
    "default_meta": {},
    "fields": [],
    "prompt": {},
    "output": {}
  },
  "answers": {
    "meta": {
      "character": "",
      "time": "",
      "location": ""
    },
    "form_values": {}
  }
}
```

兼容直接导入裸 v2 preset。裸 preset 没有填写结果，所有输入使用 preset 默认值。导出不包含
`state`、`use_stream`、`compiled_prompt_snapshot` 或 `opening_assistant_message_id`。

内置寒冬/通用表单没有 runtime v2 preset 时，导出前由 PRE UI 将当前有效表单规范化为 runtime
v2；字段定义、当前答案和空字符串字段全部写入同一导出包。导入后统一进入 runtime 表单分支，因此可在文本编辑器里修改
`label`、默认值、选项、导演指令和禁用事项后再次导入。

字段 `label` 是显示名称，修改它不会影响答案绑定；字段机器 `key` 是绑定标识，若修改 `key`，导入文件中的
`answers.form_values` 必须同步使用新 key，否则该字段按默认值恢复。

## 导入流程

1. 用户选择 `.json` 文件。
2. UI 读取文本并执行 `JSON.parse`。
3. 识别完整包或裸 v2 preset，使用 Zod 完整校验。
4. 校验 `select` 答案与选项；错误信息包含具体字段路径或字段标签。
5. 弹出覆盖确认。
6. 生成新的 preset、聊天 payload 和世界书正文，但尚不写入。
7. 捕获当前聊天 ID；写入角色卡默认 preset、聊天 preset 快照和聊天 opening payload。
8. 将内容同步到捕获聊天的专属世界书。
9. 若同步失败，保留已经导入的表单配置和答案，明确显示“世界书同步失败”，不伪装为全部成功；用户可用“同步世界书”重试。

导入不会删除或修改已有聊天楼层，也不会自动生成剧情。

## 导出流程

- 无论当前是 runtime、寒冬还是“新的故事”，只要不在生成/导入/同步忙碌状态，都允许导出。
- runtime 分支直接使用当前聊天 preset 快照；寒冬/通用分支先从当前有效表单生成 portable runtime v2 preset。
- 使用当前表单的 `meta/form_values` 生成格式化 JSON，字段没有填写时保留对应空字符串。
- 文件名为 `同层PRE开局_<preset_id>_<YYYY-MM-DD>.json`，其中非法文件名字符替换为 `-`。
- 使用浏览器 `Blob` 和临时下载链接，不向外部服务器发送数据。

## 世界书同步流程

### 条目正文

```text
<same_layer_pre_opening_context>
<opening_task>
……
</opening_task>

<opening_meta>
主角：……
时间：……
地点：……
</opening_meta>

<player_opening_choices>
字段标签：填写值
……
</player_opening_choices>

<persistent_directives>
- ……
</persistent_directives>

<forbidden>
- ……
</forbidden>
</same_layer_pre_opening_context>
```

用户可填写文本中的 `&`、`<`、`>` 进行实体转义，保证结构标签不被破坏。空值写为“未设定”。

### 幂等更新

- 读取当前聊天世界书。
- 若没有固定名条目，使用 `createWorldbookEntries` 新增。
- 若已有一个或多个固定名条目，使用 `updateWorldbookWith` 保留第一个并更新内容，同时删除重复项。
- 其他世界书条目原样保留。

### 显式写入时机

1. JSON 导入完成后立即同步一次。
2. 用户点击“同步世界书”时同步。
3. 用户点击“生成开局”时，在必填校验之后、调用 `generate()` 之前强制同步并等待完成。
4. 普通输入只保存聊天变量，不实时写世界书。

生成前同步失败时必须停止生成、保留表单并打开配置面板。异步同步期间若聊天 ID 发生变化，当前流程终止，不在新聊天继续生成。

## UI

`OpeningSetupPanel.vue` 在开局表单顶部增加：

- `导入 JSON`
- `导出 JSON`
- `同步世界书`
- 隐藏的 `input[type=file]`，仅接受 JSON

组件只负责选择文件和发送事件。`StoryPagePre.vue`
负责解析、确认、变量写入、下载、世界书同步以及通知。导入、同步或生成期间禁用重复操作。

## 模块边界

- `runtimeOpeningPresetTransfer.ts`：JSON schema、legacy 表单到 runtime
  v2 的规范化、导入解析、默认答案合并、导出包、世界书正文生成。
- `runtimeOpeningWorldbookSync.ts`：聊天世界书解析、固定条目构建、幂等更新和聊天切换保护。
- `runtimeOpeningPreset.ts`：角色卡默认 preset 与聊天快照的纯读取/写入辅助。
- `OpeningSetupPanel.vue`：展示与事件。
- `StoryPagePre.vue`：UI 状态与 Tavern Helper 副作用编排。

## 错误处理

- JSON 语法、包版本、preset schema 或答案校验失败：不修改任何状态。
- 导入变量写入失败：显示错误，不同步世界书。
- 世界书同步失败：不生成；导入的表单仍保留并可重试同步。
- 聊天切换：同步/生成流程中止。
- 重复点击：共享 busy 状态阻止并发导入、同步或生成。

## 验证

- 单元测试覆盖完整包、裸 preset、默认值合并、非法版本、非法选择值、实体转义和不导出运行状态。
- 单元测试覆盖世界书新增、覆盖、重复收敛、其他条目保留、位置/序号/递归契约和聊天切换。
- 源码契约测试覆盖三个 UI 操作、聊天快照优先级及生成前同步顺序。
- 运行 PRE 相关测试、格式检查和定向 production build。
- 现场验证两个聊天各自写入不同世界书内容且实际 AI 请求使用对应条目；现场验证不由源码测试或构建结果替代。

## 非目标

- 不修改小手机平台或寒冬手机适配器。
- 不把 output 标签作为常驻世界书指令。
- 不删除或重写已有聊天消息。
- 不在每次键盘输入时写世界书。
- 不自动提交或推送 Git 改动。
