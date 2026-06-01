# 当前 st-chatu8 v2.6.1 同层图片事件流

## 1. 现场日志归纳

来自 2026-06-01 控制台与调试日志，触发楼层生图后可观察到以下顺序：

```text
用户/同层 UI 触发某楼层图片生成
  ↓
regex-st-chatu8-test-message       × 多次
  ↓
regex-st-chatu8-result-message     × 多次
  ↓
ch-llm-image-gen-request
  ↓
LLM 生成图片提示词
  ↓
ch-llm-image-gen-response
  ↓
imageInserter.parseImagesFromPrompt
  - 解析 <images>/<image>
  - 提取 image###...### / regex: ...
  ↓
imageInserter.insertImagesIntoElement
  ↓
imageInserter.saveImageGroup
  - 将图片组/提示词组写入插件自己的数据结构或正文相关位置
  ↓
character_message_rendered
  - 酒馆重新渲染该角色消息
  - 插件按钮/placeholder 在宿主 .mes_text 中变得可读
  ↓
st_chatu8_auto_click_complete
  ↓
generate-image-request / generate-image-response
  - 真实图片请求和返回
  - img[src] 才逐步 ready
```

## 2. 同层 UI 应该在哪些点接管

| 阶段 | 是否接管 | 原因 |
|------|----------|------|
| `regex-st-chatu8-test-message` | 是，轻量 probe | 插件开始解析正文触发规则；可提前绑定最近楼层 intent |
| `regex-st-chatu8-result-message` | 是 | 正则结果决定 image### / regex 锚点，适合刷新 prompt placeholder |
| `ch-llm-image-gen-response` | 是，但不能作为最终 DOM 时点 | LLM 提示词已回，但 `saveImageGroup` 和宿主重渲染还未完成 |
| `character_message_rendered` | 必须 | 宿主 `.mes_text` 刚渲染，插件按钮/placeholder 最可能在这里落地 |
| `st_chatu8_auto_click_complete` | 是，补偿 | 自动点击/插入正文完成后的兜底刷新点 |
| `generate-image-response` | 是 | 真实图片到达后刷新 gallery / 图片实体 |
| DOM 有按钮但无 `img[src]` | 必须 | 正文位置依赖按钮/placeholder，不能等图片 ready |

## 3. DOM 载体翻译

当前同层适配应识别这些插件原生节点：

```css
.st-chatu8-image-button
button.image-tag-button
.st-chatu8-image-span
span.image-tag-placeholder
.ai-image-container
```

常用数据字段：

```text
data-image-tag     图片提示词 / tag
data-link          另一种 prompt/tag 字段
data-prompt-token  image###...### token
data-request-id    生图请求 id
data-image-id      插件图片 id
```

## 4. 与旧链路的差异

旧适配默认认为：

```text
ch-llm-image-gen-response → 可读 extra.images / DOM → 同层刷新
```

v2.6.1 实测更接近：

```text
ch-llm-image-gen-response → parse/save → character_message_rendered → 可读 DOM
```

因此：

- LLM response 只表示“提示词已经回来”，不表示“正文按钮已经进 DOM”。
- `extra.images` 在真实图片回来前可能没有 `src`，但原始 `regex` / anchor 信息仍然重要。
- 同层 UI 必须在 response 后追加短延迟 probe，并监听 `character_message_rendered`。
