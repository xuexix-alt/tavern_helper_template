# 寒冬末日｜Opening 表单与世界书集成开发文档

> 状态：当前口径  
> 适用范围：`src/寒冬末日/界面同层版/`

---

## 1. 当前真实数据源

当前 opening 只保留一条长期配置链：

- **chat 变量**：`stream_demo.opening`

它承担：

- opening 表单恢复
- opening seed / result 楼层锚点恢复
- 世界观档位、主流派、主角前身份、剧情基调、补充设定等长期 opening 配置恢复

当前已经**废除**：

- 旧的楼层 MVU 开局配置占位字段
- 旧的开局动态世界书注入条目

原因：

- 该链路已不再由运行时写入
- 只剩 schema / initvar 默认空壳，容易制造“看起来有字段，实际上没有真实值”的误导

---

## 2. 文件总览

### 2.1 UI / opening 主流程

- `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
  - opening 生成主流程
  - opening seed / result 真实楼层写入
  - opening chat 状态恢复与持久化

- `src/寒冬末日/界面同层版/shared/opening.ts`
  - opening prompt 上下文编译
  - `stream_demo.opening` 读写
  - opening 表单默认值与迁移

- `src/寒冬末日/界面同层版/shared/opening.schema.ts`
  - opening UI 工作流状态结构

### 2.2 世界书

- `src/寒冬末日/世界书/寒冬末日/世界设定.txt`
  - 当前直接从 `stream_demo.opening` 读取 opening 配置

- `src/寒冬末日/世界书/index.yaml`
  - 保留 `世界设定`
  - 不再注册旧的 opening 动态注入条目

### 2.3 MVU / schema

- `src/寒冬末日/schema.ts`
  - 保留正式 `stat_data` 结构
  - 不再预留旧的 opening 占位结构

- `src/寒冬末日/世界书/寒冬末日/[initvar].yaml`
  - 作为聊天初始化基准
  - 不再预留旧的 opening 占位结构

---

## 3. 数据层分工

### 3.1 `stream_demo.opening`

当前瘦身后的核心字段：

- `state`
- `world_mode_id`
- `route_id`
- `use_stream`
- `meta.character`
- `form_values.pre_disaster_identity`
- `form_values.early_story_tone`
- `form_values.supplemental_setting`
- `form_values.custom_opening_setting`
- `opening_seed_user_message_id`
- `opening_result_message_id`

### 3.2 聊天楼层

当前 opening 真实楼层模式：

- `0层`：宿主 / 阅读器入口
- `1层`：opening seed `user`
- `2层`：opening result `assistant`

其中：

- `1层` 用于重 ROLL 与开局输入锚点
- `2层` 用于正式开局正文与后续上下文继承

### 3.3 MVU `stat_data`

当前不再承担 opening 长期配置存储。  
它只负责剧情运行态变量本身，例如：

- 世界时间 / 日期 / 末日天数
- 庇护所等级 / 能力
- 角色状态
- 主线任务

---

## 4. 当前 opening 链路

生成 opening 时：

1. UI 表单更新 `stream_demo.opening`
2. 编译 opening prompt
3. 创建或覆盖 opening seed `user` 楼层
4. 调用 `generate(...)`
5. 创建或覆盖 opening result `assistant` 楼层
6. 继续通过 `stream_demo.opening` 持久化 seed/result 锚点

不会再做：

- 向某个消息楼层额外写入“opening 专用长期配置字段”

---

## 5. 世界书如何读取 opening 配置

当前由：

- `src/寒冬末日/世界书/寒冬末日/世界设定.txt`

直接读取：

- `stream_demo.opening.world_mode_id`
- `stream_demo.opening.route_id`
- `stream_demo.opening.meta`
- `stream_demo.opening.form_values`

因此后续若扩展 opening 配置，优先更新：

- `shared/opening.ts`
- `shared/opening.schema.ts`
- `世界设定.txt`

而不是恢复旧的 MVU 占位字段。

---

## 6. 废除项

本次已经废除：

- 旧的 opening MVU 占位字段
- 对应的独立动态注入文件
- `index.yaml` 中对应的独立条目

若后续看到旧文档或旧讨论仍提到：

- “2层锁定 opening 配置”
- “世界书从某楼层 stat_data 读取 opening 长期约束”

均以本文件当前口径为准：**opening 长期配置只认 `stream_demo.opening`。**
