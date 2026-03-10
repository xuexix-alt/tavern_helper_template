# 项目开发与交接文档 (Project Handover Documentation)

## 1. 项目概述 (Project Overview)
本项目是一个具有高度视觉风格化（Cyberpunk/HUD 风格）的 AI 对话工作台前端原型。它支持多角色对话切换、实时流式响应模拟、多主题切换以及精细的排版控制。

## 2. 技术栈 (Tech Stack)
- **框架**: React 18 (TypeScript)
- **构建工具**: Vite
- **样式**: Tailwind CSS (v4)
- **动画**: Motion (framer-motion)
- **图标**: Lucide React
- **字体**: Inter (Sans), Cormorant Garamond (Serif), JetBrains Mono (Mono)

## 3. 核心架构 (Core Architecture)

### 3.1 状态管理 (State Management)
- **App.tsx**: 顶层状态中心，管理：
  - `messages`: 对话历史数组。
  - `theme`: 当前主题 (`light` | `dark` | `gold`)。
  - `density`: UI 密度 (`comfortable` | `compact` | `minimal`)。
  - `activeCharId`: 当前选中的 AI 角色。
- **TypographyContext**: 全局管理字体大小、行高、字体族等排版偏好。

### 3.2 样式系统 (Styling System)
- **多主题实现**: 通过在 `index.css` 中定义 CSS 变量，并在 `html` 标签上切换类名 (`theme-dark`, `theme-gold`) 实现。
- **自定义 Utility**: 在 `index.css` 中定义了大量 HUD 风格的工具类：
  - `glass-panel`: 磨砂玻璃效果。
  - `hud-panel`: 带有转角装饰的面板。
  - `scanlines` / `crt-overlay`: 复古显示器滤镜。
  - `tech-grid`: 背景科技网格。

## 4. 后端集成指南 (Backend Integration Guide)

### 4.1 核心数据结构 (Data Structures)
后端开发者应参考 `src/types.ts` 中的定义：
- `Message`: 包含 `id`, `role` (user/assistant/system), `content`, `timestamp`, 以及可选的 `meta` (包含 token 数、耗时、模型信息等)。

### 4.2 建议的 API 接口 (Suggested API Endpoints)
1. **POST `/api/chat`**:
   - **输入**: `{ message: string, characterId: string, history: Message[] }`
   - **输出**: 建议支持 Server-Sent Events (SSE) 以实现流式输出。
   - **前端对接点**: 修改 `App.tsx` 中的 `handleSend` 函数，将模拟的 `setInterval` 替换为真实的 `fetch` 流读取。

2. **GET `/api/characters`**:
   - **输出**: 角色列表。目前硬编码在 `src/data/characters.ts`。

### 4.3 环境变量 (Environment Variables)
- 在 `.env.example` 中定义必要的 API Base URL。
- 客户端调用需使用 `import.meta.env.VITE_API_URL`。

## 5. 开发规范 (Development Standards)
- **组件化**: 保持组件功能单一，UI 与逻辑尽量分离。
- **类型安全**: 严格使用 TypeScript，避免使用 `any`。
- **响应式**: 使用 Tailwind 的断点（`sm`, `md`, `lg`, `xl`）确保在不同屏幕尺寸下的 HUD 布局稳定。
- **性能**: 列表渲染使用唯一的 `id` 作为 `key`。

## 6. 已知注意事项 (Known Issues & Notes)
- **主题切换**: 切换主题时会操作 `document.documentElement.classList`。
- **流式模拟**: 当前 `App.tsx` 中的流式效果是前端模拟的，对接后端时需注意处理 `isStreaming` 状态以禁用输入框。
- **排版系统**: 排版设置通过 CSS 变量直接作用于全局，确保后端返回的 Markdown 内容能正确响应这些变量。

---
*文档更新日期: 2026-03-09*
