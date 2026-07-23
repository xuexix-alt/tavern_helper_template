# 微信 APP 入口图标设计

## 目标

使用用户提供的 `pngsucai_4164614_8d3b6d.png`，替换小手机首页进入“微信聊天列表”的入口图标。

图片原始尺寸为 446×446，SHA-256 为：

`231218A7264273DC445FB158DD92BC5D34BEE32EF017827F666027E9CB01AD21`

只修改首页微信入口；聊天列表中的联系人头像、消息头像以及其他 APP 图标保持不变。

## 现状

手机首页由 `PhoneShell.renderHome()` 根据 `PhoneAppDefinition` 创建入口。每个 APP 当前只提供一个文本 `glyph`，外壳把它放入统一的 58×58、15px 圆角图标容器。

外壳 CSS 通过 `?raw` 导入后写入 Shadow DOM。直接在 CSS 中引用相对图片路径会依赖宿主页面与 CDN 地址，不适合作为 Android 和远端角色卡共同使用的资源路径。

## 设计

### 图片资源

将原 PNG 内容编码为独立的 TypeScript data URL 常量并随 `50通信与情报APP` 打包。这样图片内容与脚本版本一致，不依赖宿主页面路径、网络二次请求或外部文件位置。

编码过程必须保持 PNG 字节不变；实现时从 data URL 解码后的 SHA-256 应与原文件一致。

### APP 定义

为 `PhoneAppDefinition` 增加可选字段 `iconSrc?: string`：

- 微信 APP 设置 `iconSrc` 为该 PNG 的 data URL。
- 其他 APP 不设置 `iconSrc`，继续使用当前 `glyph`。
- `glyph` 字段仍保留，作为无图片 APP 的正常内容，不改变现有定义。

### 外壳渲染

`PhoneShell.renderHome()` 根据 `iconSrc` 选择内容：

- 有 `iconSrc`：在现有 `.phone-app__glyph` 容器中渲染装饰性 `<img>`。
- 无 `iconSrc`：继续渲染现有 glyph 文本。

图片设置空 `alt` 并标记为装饰性；按钮已有 APP 名称“微信”，不会损失无障碍名称。

图片填满 58×58 容器，使用 `object-fit: cover` 并继承 15px 圆角。原图自身已有绿色圆角方形背景，外壳不再叠加蓝底或文本圆点。

## 错误与兼容

- 图片数据随 JavaScript 包内联，不受 Android WebView、iframe、CDN 相对路径或缓存分片影响。
- 若未来某个 APP 提供空 `iconSrc`，仍回退到 glyph。
- 本次不修改 APP 路由、点击行为、聊天列表数据或联系人头像。

## 测试

采用测试驱动实现，覆盖：

1. 微信 APP 定义包含图片图标。
2. 具有 `iconSrc` 的 APP 渲染 `<img>`，不显示 glyph 文本。
3. 未设置 `iconSrc` 的其他 APP 仍渲染 glyph。
4. 图片 data URL 可解码为 PNG，字节哈希与原文件一致。
5. 微信入口仍指向 `messages` 路由。
6. 运行相关小手机测试和完整 `pnpm build`。

## 验收标准

- 小手机首页“微信”入口显示用户提供的绿色微信图片。
- 图标清晰填满现有入口尺寸，圆角与其他 APP 对齐。
- 点击后仍进入原微信聊天列表。
- 聊天列表头像和其他 APP 图标没有变化。
