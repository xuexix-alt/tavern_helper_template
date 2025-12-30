# UI 移植与重构规划 (APP后台版 -> 电竞 Dashboard 风格)

## 1. 基础架构与布局 (Infrastructure & Layout)
- [x] **Tailwind 配置**:
    - [x] 引入 `slate-950` 等自定义颜色，配置字体和全局动画 (pulse, glow)。
    - [x] **保留美团色系**: 配置 `accent-primary` (#ffc300) 等原有品牌色，确保在浅色模式下保留美团风格元素。
- [x] **全局容器重构 (`App.vue`)**:
    - [x] 移除 `.phone-frame` 手机外框和固定高度限制，改为 `min-h-screen` 全屏响应式布局。
    - [x] 实现 **CSS Grid/Flex 三栏布局**:
        - 左侧：固定宽度导航栏 (Sidebar)
        - 中间：自适应核心内容区 (Play Area) + 底部服务区 (Bottom Service Area)
        - 右侧：固定宽度信息栏 (Right Info Panel)

## 2. 左侧导航栏 (Left Sidebar)
- [x] **新建 `Sidebar.vue` 组件**:
    - [x] 移植参考 UI 的 Sidebar 样式（渐变背景、毛玻璃）。
    - [x] **菜单项映射**:
        - Home (首页)
        - **PLAY** (新增，作为最显著的核心入口)
        - Service (服务)
        - History (历史)
        - Me (我的)
    - [x] 实现路由跳转逻辑。

## 3. 中间核心区域 (Center Stage)
- [x] **新建 `Play.vue` 页面 (核心交互区)**:
    - [x] 对应图片**上方红色区域**。
    - [x] **视觉风格**: 移植 `FeaturedGameCard` 的视觉风格（大图背景、发光边框）。
    - [x] **正文流式显示**:
        - [ ] 监听酒馆 (SillyTavern) 的正文内容流 (EventSource/Socket)。
        - [x] 实现流式输出打字机效果 (Typewriter Effect)。
        - [ ] **动态丰富显示效果**:
            - [ ] 优化 Markdown 渲染 (支持粗体、斜体等)。
            - [ ] 区分显示：对话(高亮)、心理描写(斜体/灰度)、旁白(默认)。
            - [ ] 添加文本淡入动画，提升沉浸感。

## 4. 底部区域拆分 (Bottom Service Split)
将原 `Service.vue` 的内容拆分为两个独立的展示组件，放置在 Play 页面下方：

- [x] **Service 页面 2 (Bottom Left)**:
    - [x] 对应图片**左下角红色区域**。
    - [x] **新建 `ServiceStats.vue`**:
        - 移植 `ProfitsSection` 样式。
        - 展示：全局统计、胜率/进度圆环、账户余额等数据。
- [x] **Service 页面 (Bottom Center)**:
    - [x] 对应图片**中下角红色区域**。
    - [x] **新建 `ServiceStatus.vue`**:
        - 移植 `UserInfoCard` 样式。
        - 展示：当前服务女孩的头像、名称、等级、XP进度条、关键属性（如好感度）。

## 5. 右侧信息栏 (Right Sidebar)
将原本分散的信息整合到右侧垂直栏：

- [x] **店铺列表 (Top)**:
    - [x] 对应图片**右上角** (原 `LastWinners` 位置)。
    - [x] **新建 `ShopList.vue`**: 展示当前可用的店铺/女孩列表。
- [x] **套餐详情页 (Middle)**:
    - [x] 对应图片**右中** (原 `TournamentChat` 位置)。
    - [x] **新建 `PackageDetail.vue`**: 展示当前选中套餐的详细文本描述、对话记录或互动信息。
- [x] **图片展示 (Bottom)**:
    - [x] 对应图片**右下** (原 `TopPlayers` 位置)。
    - [x] **新建 `PackageImages.vue`**:
        - [x] 展示套餐相关的预览图或画廊。
        - [x] **多源图片支持**:
            - [x] 支持远程 URL (http/https) 加载。
            - [x] **本地解码**: 支持本地文件路径及 Base64/Blob 数据解码显示。
        - [ ] **自适应布局**:
            - [ ] 实现 `object-cover` / `object-contain` 的智能切换。
            - [ ] 保持容器比例协调，防止图片拉伸变形。
        - [x] **错误处理**: 图片加载失败时显示美观的占位符/Fallback。

## 6. 数据流与状态管理 (Data & State)
- [ ] **提取 Service 逻辑**:
    - [ ] 将 `Service.vue` 中的 `girlsData`, `currentGirl`, `refreshData` 等逻辑提取为 `useServiceStore` (或 Composable)，以便底部组件和右侧组件共享数据。
- [x] **路由调整**:
    - [x] 设置默认路由为 `/play` (或保持 `/home` 但布局包含 Play 模块)。

## 7. 样式美化 (Polishing)
- [x] 应用 Cyberpunk 风格的边框 (`border-blue-500/20`) 和阴影。
- [x] **双主题适配**:
    - [x] **深色模式 (默认)**: Cyberpunk 电竞风格。
    - [x] **浅色模式 (保留)**: 保留原有的美团外卖风格配色和元素。
- [x] **载入画面 (SplashScreen)**:
    - [x] 根据当前主题 (深色/浅色) 显示对应的载入动画和背景。
