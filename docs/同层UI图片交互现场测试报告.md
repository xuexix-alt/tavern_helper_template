# 同层UI图片交互现场测试报告

> **测试时间**: 2026-06-04  
> **环境**: SillyTavern 127.0.0.1:8000  
> **聊天**: 末世寒冬-星穹秩序 - 2026-05-27  

---

## 📊 初始状态检查

### 消息13状态

```json
{
  "messageId": 13,
  "hasImageMarker": true,
  "imageMarkerCount": 4,  // 正文中有4个 image### 标记
  "pluginContainerCount": 0,  // ❌ 宿主DOM中没有插件容器
  "pluginButtonCount": 0,     // ❌ 宿主DOM中没有插件按钮
  "allImageCount": 5,         // 5张图片（1个头像 + 4个空src）
  "htmlLength": 12683
}
```

**关键发现**：
- ✅ 正文中有4个 `image###` 标记
- ❌ 插件未渲染图片到宿主DOM（pluginContainerCount=0）
- ❌ 图片src为空（visible: false）

### 画廊状态

```json
{
  "hasGalleryPanel": true,
  "galleryImageCount": 4,  // ✅ 画廊显示4张图片
  "imageInfo": [
    {
      "src": "data:image/png;base64,iVBORw0...",
      "visible": true,
      "width": 127,
      "height": 169
    }
  ]
}
```

**关键发现**：
- ✅ 画廊面板已打开
- ✅ 4张图片正常显示（有base64数据）
- ✅ 图片可见（visible: true）

### 画廊图片数据

```json
{
  "messageId": "13",
  "markerId": "gm:13:1b97inr",
  "requestId": "",      // ❌ 空
  "promptToken": ""     // ❌ 空
}
```

**关键发现**：
- ✅ messageId 正确
- ✅ markerId 正确
- ❌ requestId 和 promptToken 为空

---

## 🧪 测试计划

### 测试1：画廊图片单击（查看原图）
- 操作：单击画廊中的第一张图片
- 预期：打开图片查看器

### 测试2：画廊图片双击（重新生成）
- 操作：双击画廊中的第一张图片
- 预期：触发重新生成图片

### 测试3：画廊图片长按（插件菜单）⭐ 核心测试
- 操作：长按画廊中的第一张图片
- 预期：触发插件的tag菜单
- 检查：
  - 是否找到宿主DOM目标？
  - 是否触发降级方案？
  - 控制台日志是否正确？

### 测试4：正文图片交互
- 操作：查找正文中的图片（如果有）
- 测试：单击、双击、长按

### 测试5：UI加载时序观察
- 观察：图片"短暂出现又消失"的现象
- 监控：控制台日志的时序
- 检查：我们的修复日志是否出现

---

## 开始测试...
