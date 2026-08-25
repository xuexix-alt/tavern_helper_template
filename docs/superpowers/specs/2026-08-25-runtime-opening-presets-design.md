# PRE 运行时角色卡 Opening Preset 设计

## 目标

让 same-layer-pre 在酒馆运行时从当前角色卡变量读取开局配置。新增角色卡只需携带一份 preset，不修改、也不重新构建 PRE。`mes=0` 永远只作为正则替换后的 PRE 载体；玩家提交表单后，动态生成的正式剧情直接成为可见 assistant `mes=1`。

## 运行时配置载体

- 配置路径：角色卡变量 `same_layer_pre.opening_preset`。
- 读取接口：`getVariables({ type: 'character' })`。
- 角色卡变量来自 `extensions.tavern_helper.variables`，不进入聊天正文，也不作为世界书文本注入模型。
- 天欲卡以 `src/天欲太和录/opening-preset.yaml` 作为作者侧真源；现有变量结构脚本负责把它写入当前角色卡变量，取代固定序章自动创建逻辑。
- 读取优先级：有效角色卡 v2 preset > 现有寒冬内建 preset。检测到配置但校验失败时显示明确错误，不静默生成寒冬剧情。

## Preset v2

配置包含：

- `version`、`preset_id`
- `ui.title`、`ui.intro`、`ui.submit_label`
- `meta_template`、`default_meta`
- `fields`：`text`、`textarea`、`select`，支持必填、默认值、候选项和占位文案
- `prompt.task`、`prompt.directives[]`、`prompt.forbidden[]`
- `output.content_tag`、`output.option_tag`、`output.option_count`

PRE 不执行 preset 中的 JavaScript，也不允许任意表达式。表单元数据与所有字段按标签和值自动序列化为结构化提示词，角色卡只声明导演任务、约束和禁忌。酒馆仍负责正常注入角色定义、世界书和 MVU 变量规则。

## 提示词组装

运行时生成器按固定顺序组装：

1. `<opening_request>` 与角色卡声明的任务。
2. `<opening_meta>`：主角、时间、地点。
3. `<player_opening_choices>`：自动列出每个表单字段的标签和值。
4. `<card_directives>` 与 `<forbidden>`。
5. 稳定输出契约：正文标签与指定数量的后续选项。

字段为空时输出“未设定”；必填字段在提交前阻止生成。最终文本再经过 Tavern 宏替换，使 `{{user}}` 等现有宏保持兼容。

## 楼层与生成流程

- opening 表单是 PRE iframe 内的强制启动态，不创建酒馆消息。
- 提交时仅调用 `generate({ user_input: compiledPrompt })`，不先创建 user 消息。
- 生成成功后只创建一条可见 assistant 消息，因此新聊天为 `mes0=PRE carrier`、`mes1=正式开局`。
- 生成失败不落残留楼层，状态回到 configuring，保留表单数据供重试。
- `compiled_prompt_snapshot` 和 `opening_assistant_message_id` 继续存入聊天变量。
- 重新生成开局时复用 snapshot，不依赖不存在的开局 user 楼层。
- 正常第一轮玩家输入从 `mes=2` 开始。

## 天欲太和录配置

天欲表单至少提供：主角姓名、初始身份、阴阳道路、开局地点、初始目标、剧情基调、文风与字数。导演指令从藏经阁残卷失窃和天欲气息事件展开，保留太和与天欲的道德复杂性，不替玩家决定长期道路或关系。

## 兼容与错误处理

- 没有角色卡 preset 的寒冬聊天保持现状。
- 当前通用故事入口继续可用，不作为运行时角色卡配置的替代品。
- 已经存在可见 assistant 正文的聊天不再次弹出 opening。
- 角色卡 preset 与聊天 payload 的 `preset_id` 不一致时，按新 preset 重建默认表单值，避免跨卡污染。
- 运行时配置错误展示具体 Zod 路径，禁止静默回退。

## 验证

- 单元测试覆盖 preset 解析、非法配置、默认值与结构化提示词。
- 源码契约测试覆盖角色变量读取、运行时表单分支和 assistant-only 生成。
- 天欲测试证明固定序章 bootstrap 已移除，preset 被写入角色卡变量。
- 构建定向覆盖 PRE 与天欲变量脚本。
- 酒馆现场验证新聊天仅有 `mes=0` 时显示天欲表单，提交后出现可见动态 assistant `mes=1`，且 PRE carrier 未被改写。
