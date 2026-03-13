# 寒冬末日｜Opening 表单、变量、世界书、楼层生成集成开发文档

> 状态：已实现口径
> 适用范围：`src/寒冬末日/界面同层版/`
> 目的：给后续开发者快速理解当前 opening 的表单、chat 变量、MVU `stat_data`、世界书注入与真实楼层生成链路。

---

## 1. 当前目标与结论

当前 opening 系统已经从“一次性 UI 生成器”升级为一条完整业务链：

- 表单用于编译 opening seed prompt
- opening seed 进入真实聊天楼层
- opening result 进入真实聊天楼层
- opening 的长期约束写入 `2层` 对应的 `stat_data`
- 世界书通过 EJS / `getvar(...)` 从 `stat_data` 读取长期约束，再重新送回 prompt

也就是说，当前链路不是：

- 只靠 opening chat 变量影响正文

而是：

- 聊天楼层承担短期上下文
- `stat_data` 承担长期运行态锚点
- 世界书负责把长期锚点重新注入到 prompt

---

## 2. 文件总览

### 2.1 UI / 楼层侧

- `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
  - opening 生成主流程
  - 真实 `seed user / result assistant` 楼层写入
  - opening chat 状态持久化
  - `2层 stat_data.世界.开局配置` 写回

- `src/寒冬末日/界面同层版/shared/opening.ts`
  - opening prompt 上下文编译
  - opening chat 变量读写
  - opening chat 变量瘦身持久化

- `src/寒冬末日/界面同层版/shared/opening.schema.ts`
  - opening UI 工作流状态结构

### 2.2 MVU / schema

- `src/寒冬末日/schema.ts`
  - `stat_data` 的正式结构
  - 当前已新增：`世界.开局配置`

- `src/寒冬末日/世界书/寒冬末日/[initvar].yaml`
  - 新聊天初始化的基准结构
  - 当前已新增：`世界.开局配置` 的字段位

### 2.3 世界书 / 提示词

- `src/寒冬末日/世界书/寒冬末日/世界观.txt`
  - 静态世界观

- `src/寒冬末日/世界书/寒冬末日/世界观_开局配置注入.txt`
  - 动态 opening 配置注入
  - 从 `stat_data.世界.开局配置` 读取长期约束

- `src/寒冬末日/世界书/index.yaml`
  - 已新增：`世界观-开局配置注入`

---

## 3. 数据层分工

当前 opening 相关数据分三层：

### 3.1 opening chat 变量

路径：

- `stream_demo.opening`

作用：

- UI 工作流状态恢复
- 表单恢复
- 重 ROLL 锚点
- 不承担完整正文镜像存储

当前已做瘦身，只保留：

- `state`
- `world_mode_id`
- `route_id`
- `use_stream`
- `meta.character`
- `form_values.pre_disaster_identity`
- `form_values.early_story_tone`
- `form_values.supplemental_setting`
- `opening_seed_user_message_id`
- `opening_result_message_id`

不再保留：

- 完整 opening 正文
- 完整 prompt
- 文风
- 字数
- 初始时间 / 地点
- 庇护所能力摘要镜像

### 3.2 聊天楼层

当前 opening 已改为真实楼层模式：

- `0层`：宿主 / 阅读器入口，不存 opening 正文
- `1层`：opening seed `user`
- `2层`：opening result `assistant`

其中：

- `1层` 用于重 ROLL
- `2层` 用于正式开局正文与后续上下文继承

### 3.3 MVU `stat_data`

长期运行态锚点放在：

- `stat_data.世界.开局配置`

作用：

- 供世界书重新读取并注入 prompt
- 供高楼层时补偿 opening 楼层被裁掉后的长期约束
- 供后续脚本或 UI 读取

---

## 4. 当前楼层链路

### 4.1 生成前

opening 表单只会写：

- opening chat 变量

不会写：

- `stat_data`

原因：

- 玩家可能反复改表单
- 玩家可能连续重 ROLL
- 表单未锁定前，不应污染正式运行态变量

### 4.2 点击“生成开局”后

执行顺序：

1. 编译 opening prompt
2. 创建或覆盖 opening seed `user` 楼层
3. 调用 `generate({ max_chat_history: 'all' })`
4. 创建或覆盖 opening result `assistant` 楼层
5. 把开局配置写入 `2层 stat_data.世界.开局配置`

### 4.3 为什么写入 2 层而不是 1 层

当前约定：

- `1层` 是生成器输入
- `2层` 是本局正式确认过的 opening 结果

因此：

- `2层` 是“锁定本次开局”的最合理 MVU 基准点
- 后续第 `3层+` 的变量推演，也应从 `2层` 继承

---

## 5. `世界.开局配置` 字段设计

当前字段如下：

```yaml
世界:
  开局配置:
    sealed: false
    world_mode_id: ""
    route_id: ""
    pre_disaster_identity: ""
    early_story_tone: ""
    opening_seed_user_message_id: 0
    opening_result_message_id: 0
    form_values:
      supplemental_setting: ""
    meta:
      source: "opening_ui"
      version: 1
```

字段含义：

- `sealed`
  - 是否已锁定为正式 opening 配置
- `world_mode_id`
  - 世界观档位
- `route_id`
  - 开局主流派
- `pre_disaster_identity`
  - 主角前身份
- `early_story_tone`
  - 后续剧情基调
- `opening_seed_user_message_id`
  - seed 楼层锚点
- `opening_result_message_id`
  - result 楼层锚点
- `form_values.supplemental_setting`
  - 补充设定
- `meta.source`
  - 当前约定固定为 `opening_ui`
- `meta.version`
  - 当前结构版本

明确不写入该结构的字段：

- 文风
- 字数
- 初始时间
- 初始地点
- 庇护所能力摘要

原因：

- 这些不是长期约束，或会在后续剧情中自然变化

---

## 6. 世界书如何读取

### 6.1 动态世界观注入

当前由：

- `世界观_开局配置注入.txt`

负责把 `stat_data` 中的 opening 长期锚点重新送回 prompt。

它会读取：

- `stat_data.世界.开局配置.world_mode_id`
- `stat_data.世界.开局配置.route_id`
- `stat_data.世界.开局配置.pre_disaster_identity`
- `stat_data.世界.开局配置.early_story_tone`
- `stat_data.世界.开局配置.form_values.supplemental_setting`
- `stat_data.庇护所.庇护所等级`
- `stat_data.庇护所.庇护所能力总述`

### 6.2 世界书职责

当前职责拆分为：

- `世界观.txt`
  - 只负责静态世界观

- `世界观_开局配置注入.txt`
  - 只负责动态 opening 长期约束

### 6.3 为什么要拆开

因为 opening 选择是运行时结果，不适合直接写死在静态世界观文件里。

---

## 7. 庇护所能力链路

庇护所能力当前仍沿用既有设计：

- `庇护所升级能力.txt` 是能力总表
- `stat_data.庇护所.庇护所能力` 记录当前已生效能力名
- `stat_data.庇护所.庇护所能力总述` 由后台脚本实时重算

当前设计中：

- opening 不负责自己拼“庇护所总述”
- opening 只需要给出正确的等级 / 运行态入口
- 后台脚本负责能力同步与总述生成

### 7.1 世界书约束规则

当前共识已经写进世界书 / COT：

- `stat_data.庇护所.庇护所能力` 列举了当前已生效的庇护所能力
- 未列举的能力不应该生效
- 总表只用于解释已激活能力的功能与边界

---

## 8. 重 ROLL 规则

当前只允许在 opening 阶段重 ROLL：

- 允许：只有 `seed / result` 楼层时
- 不允许：已经出现正式剧情楼层后

### 8.1 当前实现

- 若 `opening_result_message_id` 后已经有正式楼层
- 则阻止重 ROLL，并弹提示

### 8.2 重 ROLL 的覆盖逻辑

重 ROLL 时：

- 复用 seed 楼层
- 覆盖 result 楼层
- 再次把新的 `世界.开局配置` 覆盖写入同一个 result 楼层的 `stat_data`

也就是说：

- 不回退 initvar
- 只覆盖 opening 阶段已经锁定的 result message 变量

---

## 9. `initvar` 的注意事项

### 9.1 当前项目规则

本项目里：

- `[initvar]变量初始化勿开` 这个条目 **不启用** 也会作为 init 基准生效

这是项目当前既有规则，不要按常规“启用世界书条目才生效”理解。

### 9.2 initvar 的定位

`[initvar].yaml` 当前定位是：

- baseline 结构定义
- 新聊天第一次初始化 `stat_data` 的依据

不是：

- 每轮覆盖运行态的动态真相源

因此：

- 应该在 initvar 里预留字段位
- 但运行时真实值应通过 `Mvu.replaceMvuData(...)` 写入 `stat_data`

---

## 10. EJS 语法注意事项

本次开发中已经踩过一次坑，必须记录：

### 正确写法

- 控制块：
  - `<%_ if (...) { _%>`
  - `<%_ } _%>`
- 输出块：
  - `<%= expression %>`

### 错误写法

- `<%_= expression _%>`
- `<%= expression _%>`

这两种写法会在生成阶段触发：

- `Unexpected token '=' while compiling ejs`

本仓库里过去存在少量错误示例，已修正主要规范与样例；后续新增 EJS 世界书时，必须严格使用：

```ejs
<%= value %>
```

---

## 11. 当前实现的关键函数

### `shared/opening.ts`

- `buildOpeningGeneratePrompt(...)`
  - 编译 opening prompt
- `replaceOpeningPayloadInChat(...)`
  - 写 opening chat 状态（瘦身版）

### `useStreamingDemo.ts`

- `upsertOpeningSeedMessage(...)`
  - 创建 / 覆盖 opening seed user 楼层
- `upsertOpeningResultMessage(...)`
  - 创建 / 覆盖 opening result assistant 楼层
- `syncOpeningConfigToResultMvu(...)`
  - 把 opening 锁定配置写入 result 楼层的 `stat_data.世界.开局配置`
- `generateOpening()`
  - opening 主流程
- `rerollOpening()`
  - opening 重 ROLL

---

## 12. 后续开发建议

### 已完成

- opening 表单 → prompt 编译
- opening seed / result 真实楼层化
- opening chat 瘦身
- `2层 stat_data.世界.开局配置` 写回
- 动态世界观世界书注入

### 下一步推荐

1. 进一步把 opening 的 stat_data 写回与“庇护所等级初始解算”串起来
2. 为 opening result message 增加更明确的“锁定 / 已进入正式剧情”状态判断
3. 若未来扩展表单字段：
   - 长期稳定字段 → 直接升格到 `世界.开局配置`
   - 辅助字段 → 放进 `世界.开局配置.form_values`

---

## 13. 最终口径（一句话）

当前 opening 系统的最终口径是：

**表单负责生成 opening 构筑，聊天楼层负责记录 opening 过程，`2层 stat_data` 负责锁定长期约束，世界书负责把这些约束重新送回 prompt。**

