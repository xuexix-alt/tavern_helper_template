# same-layer-pre 画廊 beta 实证模型

这个 beta 不是同层图片持久化的新实现，而是用最小 UI 验证一件事：pre 能不能在不复制图片数据的前提下，按 st-chatu8 原生身份复刻可见图片，并把点击、双击、移动端长按交回宿主插件 DOM。

## 事件模型

```ts
eventOn(tavern_events.MESSAGE_UPDATED, id => refreshImageRef(id));
eventOn(tavern_events.MESSAGE_EDITED, id => refreshImageRef(id));
eventOn(tavern_events.USER_MESSAGE_RENDERED, id => hydrateImageDom(id));
eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, (id, type) => hydrateImageDom(id));
```

`MESSAGE_UPDATED` / `MESSAGE_EDITED` 只负责按 messageId 定向刷新轻引用。`USER_MESSAGE_RENDERED` / `CHARACTER_MESSAGE_RENDERED` 说明宿主楼层 DOM 可能刚落地，因此先扫一次，再用 `:settled` 延迟二扫抓插件后续补上的按钮或图片节点。画廊关闭时只记录脏事件；打开时用 `reason=drawer_open` 做一次懒扫描。

## 原生真相顺序

生成请求只负责拿结果。持久化真相按插件原生路径查，不把图片体积塞进 same-layer-pre：

1. `chat[messageId].extra.images[swipeId]`
2. 消息正文里的 `image###...###` 或 `<image>...</image>` 标签
3. `chatMetadata['st-chatu8']` 里的 `image_groups` 后备缓存
4. 宿主 `.mes_text` 里由插件创建或处理过的 DOM

`docs/插件混淆还原/st-chatu8/utils/iframe/placeholder.js` 能印证这个方向：约 110 行用 `data-link` / `data-image-tag` 找已有按钮，约 146 行确保 `extra.images` 存在并写回；约 356 行创建 `button.image-tag-button`，约 402 行 click 直接调用 `triggerGeneration(button)`。

## 轻引用格式

如果 UI 另一个位置要复刻一张持久化图片，只存身份，不存 base64、idb src 或 imageData：

```html
<span
  data-chatu8-image-ref
  data-message-id="13"
  data-swipe-id="0"
  data-image-tag="image###...###"
  data-link="image###...###">
</span>
```

渲染时按 `messageId + swipeId + tag/link` 去原生来源解析已有 src，再显示一份 `<img>`。`src` 只用于当前显示；`lightKey` 只能包含 `mes`、`swipe`、`req`、`img`、`token/tag/link hash` 这类轻身份。

## 性能边界

同层 DB 不保存 base64，不保存 imageData，不复制插件图片体。热路径只在对应楼层的 `MESSAGE_UPDATED`、`MESSAGE_EDITED`、`USER_MESSAGE_RENDERED`、`CHARACTER_MESSAGE_RENDERED` 后定向刷新，不扫全聊天、不重算全图库。`drawer_open` 是 beta 面板的人工观测入口，用来判断最新含图楼层当前停在 DOM、EXTRA、TAG 还是 CACHE。

## 手势边界

视觉复制一个 `<img>` 不会天然继承插件手势。插件的生成、删除、锁定、解锁等行为围绕宿主 `.mes_text`、`.mes[mesid]`、`data-link`、`data-image-tag`、`extra.images`、`image_groups` 这些身份信息运行。

因此 pre 画廊点击卡片时要么代理到宿主原始元素，要么复刻足够的数据属性后让插件原生流程重新绑定。移动端尤其要验证 `touchstart` / `touchend` / `pointerdown` 的时序、坐标、目标元素和默认行为；如果同层捕获层拦截，或事件只落在 iframe clone 上，宿主插件 handler 收不到。
