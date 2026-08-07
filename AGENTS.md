<<<<<<< HEAD
# 酒馆助手前端界面与脚本开发 - AGENTS规范

> 本文档为AI编码助手提供完整的项目开发规范、技术路线和工具使用指南

---

## 📋 目录

1. [项目概述](#1-项目概述)
2. [项目结构与分类](#2-项目结构与分类)
3. [核心技术栈](#3-核心技术栈)
4. [接口使用规范](#4-接口使用规范)
5. [构建配置规范](#5-构建配置规范)
6. [酒馆变量系统](#6-酒馆变量系统)
7. [前端界面开发](#7-前端界面开发)
8. [脚本开发](#8-脚本开发)
9. [MVU变量框架](#9-mvu变量框架)
10. [Chrome DevTools MCP](#10-chrome-devtools-mcp)
11. [最佳实践](#11-最佳实践)
12. [高级技巧](#12-高级技巧)

---

## 1. 项目概述

### 1.1 项目定位

本项目专门用于编写酒馆助手 ([Tavern Helper](https://n0vi028.github.io/JS-Slash-Runner-Doc/guide/关于酒馆助手/介绍.html)) 所支持的前端界面或脚本。它们在酒馆 (SillyTavern) 中以前台或后台的形式运行，可以在代码中直接使用酒馆助手所提供的接口。

### 1.2 应用场景

- **UI美化**: 为角色卡提供更好的UI显示，如将消息楼层中纯文本的状态栏美化为有动态效果、有交互的HTML状态栏
- **交互增强**: 实现非纯文本的游玩体验，如监听现实时间或酒馆事件来实现meta游戏、播放多媒体文件
- **体验优化**: 优化酒馆使用体验，如用jQuery为预设提示词条目新增复制按钮
- **外部连接**: 连接外部应用程序，如通过socket.io-client连接外部服务器
- **功能扩展**: 新增额外功能，如每20楼在后台调用一次LLM来生成对之前剧情的总结

### 1.3 技术特性

- **运行方式**: 所有代码在浏览器中运行，支持iframe沙盒隔离
- **开发语言**: TypeScript（严格类型检查）
- **前端框架**: Vue 3 + Composition API
- **状态管理**: Pinia + Zod（数据校验）
- **样式方案**: SCSS + Vue SFC scoped styles
- **构建工具**: Webpack 5（已配置完整loader和插件）

### 1.4 设计与性能规范

- **实现方式应尽量简洁**: 项目实现方式应保持结构简单、依赖精炼，避免堆叠不必要的动画与资源加载
- **资源加载受限**: 考虑到大部分场景运行在性能较弱的手机浏览器，需要严格控制脚本体积、外部资源请求次数与内存占用，并合理拆分懒加载
- **移动端优化优先**: 全部UI与交互必须针对移动浏览器进行自适应与优化，确保触控操作舒适、布局响应迅速且不产生横向滚动

---

## 2. 项目结构与分类

### 2.1 目录结构

```
src/
├── APP/              # 前端界面项目
├── 界面示例/          # 界面项目模板
├── 脚本示例/          # 脚本项目模板
└── 模板/             # 项目模板文件夹

dist/                 # 构建输出目录（自动生成）
├── APP/
├── 界面示例/
└── 脚本示例/

@types/               # 酒馆助手API类型定义
├── function/         # 核心功能函数类型
└── iframe/           # 框架和插件接口类型
```

### 2.2 项目类型判定

- **前端界面项目**: `src/xxx` 文件夹中既有 `index.ts` 也有 `index.html`
  - 特点: 前台显示，有独立UI界面
  - 示例: `src/APP`, `src/界面示例`

- **脚本项目**: `src/xxx` 文件夹中仅有 `index.ts`
  - 特点: 后台运行，无界面
  - 示例: `src/脚本示例`

---

## 3. 核心技术栈

### 3.1 依赖库

项目使用pnpm作为包管理器，预装以下第三方库：

**核心框架:**
- `vue` - Vue 3 框架
- `vue-router` - Vue路由
- `pinia` - 状态管理

**开发工具:**
- `typescript` - TypeScript支持
- `jquery` - DOM操作
- `lodash` - 工具库
- `zod` - 数据校验
- `toastr` - 消息提示

**视觉与动画:**
- `gsap` - 动画库
- `pixi.js` - 2D渲染
- `@pixi/react` - React集成

**其他:**
- `dedent` - 文本格式化
- `jquery-ui` - UI组件
- `yaml` - YAML解析
- `@vueuse/core` - Vue组合式API

### 3.2 第三方库使用原则

- **优先使用第三方库**而不是原生API
- 使用`jquery`而不是原生DOM操作
- 使用`zod`进行数据校验和纠错
- 使用`gsap`制作动画效果
- 使用`vueuse`提供的组合式API

### 3.3 CDN使用与第三方库管理

项目提供免费的CDN服务支持，所有第三方库和GitHub文件都可以通过CDN访问。

**国内访问优化**：
- 使用 `https://testingcf.jsdelivr.net` 镜像确保国内网络环境可正常访问
- 不推荐使用 `https://cdn.jsdelivr.net`（国内可能无法访问）

**第三方库添加与管理**：
- 为项目添加第三方库时，**推荐使用** `pnpm add 第三方库名` 来安装
- 模板文件夹已配置webpack，会在打包时自动将第三方库转换为jsdelivr CDN链接
- 这可以避免在多个脚本或界面中重复打包相同的第三方库，减少总体积
- 转换后的CDN链接将使用 `https://testingcf.jsdelivr.net/npm/` 前缀

**手动CDN引用**：
```typescript
// ✅ 正确：使用国内可访问的镜像
import something from 'https://testingcf.jsdelivr.net/npm/package-name@version/+esm';

// ❌ 错误：可能无法在国内访问
import something from 'https://cdn.jsdelivr.net/npm/package-name@version/+esm';
```

---

## 4. 接口使用规范

### 4.1 @types目录限制 ⚠️ **重要**

- `@types`目录包含了所有酒馆和酒馆助手提供的依赖函数、接口和类型定义
- **禁止超出**`@types`文件夹中定义的函数和接口进行开发
- 不得自建接口或使用未在`@types`中定义的全局函数

### 4.2 @types目录结构

**function/目录 - 核心功能函数:**

| 文件 | 主要函数 | 说明 |
|------|----------|------|
| `variables.d.ts` | `getVariables`, `replaceVariables`, `updateVariablesWith`, `insertOrAssignVariables`, `insertVariables`, `deleteVariable` | 变量操作 |
| `chat_message.d.ts` | `getChatMessages`, `setChatMessages`, `createChatMessages`, `deleteChatMessages`, `rotateChatMessages` | 消息处理 |
| `displayed_message.d.ts` | `retrieveDisplayedMessage`, `formatAsDisplayedMessage` | 显示消息操作 |
| `slash.d.ts` | `triggerSlash` | STScript命令执行 |
| `script.d.ts` | `getButtonEvent`, `getScriptButtons`, `replaceScriptButtons`, `appendInexistentScriptButtons`, `getScriptInfo`, `replaceScriptInfo` | 脚本按钮管理 |
| `builtin.d.ts` | `builtin` | 内置工具访问 |
| `generate.d.ts` | `generate`, `generateRaw`, `stopGenerationById`, `stopAllGeneration` | 内容生成 |
| `raw_character.d.ts` | `RawCharacter`, `getCharData`, `getCharAvatarPath`, `getChatHistoryBrief`, `getChatHistoryDetail` | 角色卡操作 |
| `global.d.ts` | `waitGlobalInitialized`, `initializeGlobal` | 全局接口管理 |
| `inject.d.ts` | `injectPrompts`, `uninjectPrompts` | 提示词注入 |
| `util.d.ts` | `substitudeMacros`, `getLastMessageId`, `errorCatched` | 工具函数（全局） |
| `iframe/util.d.ts` | `getCurrentMessageId`, `getScriptId`, `getIframeName`, `reloadIframe` | iframe工具（iframe专用） |
| `audio.d.ts` | `playAudio`, `pauseAudio`, `getAudioList`, `replaceAudioList`, `insertAudioList`, `getAudioSettings`, `setAudioSettings` | 音频播放 |
| `lorebook.d.ts` | `getLorebookSettings`, `setLorebookSettings`, `getLorebooks`, `deleteLorebook`, `createLorebook`, `getCharLorebooks`, `setCurrentCharLorebooks` | 世界书设置 |
| `lorebook_entry.d.ts` | `getLorebookEntries`, `replaceLorebookEntries`, `updateLorebookEntriesWith`, `setLorebookEntries`, `createLorebookEntries`, `deleteLorebookEntries` | 世界书条目操作 |
| `worldbook.d.ts` | `getWorldbookNames`, `createWorldbook`, `deleteWorldbook`, `getWorldbook`, `replaceWorldbook`, `updateWorldbookWith` | 世界书管理 |
| `preset.d.ts` | `getPresetNames`, `loadPreset`, `createPreset`, `deletePreset`, `getPreset`, `replacePreset`, `updatePresetWith` | 预设管理 |
| `extension.d.ts` | `isAdmin`, `getExtensionType`, `getExtensionStatus`, `isInstalledExtension`, `installExtension`, `uninstallExtension` | 扩展管理 |
| `macro_like.d.ts` | `registerMacroLike` | 宏注册 |
| `tavern_regex.d.ts` | `formatAsTavernRegexedString`, `getTavernRegexes`, `replaceTavernRegexes` | 正则脚本操作 |
| `import_raw.d.ts` | `importRawCharacter`, `importRawChat`, `importRawPreset`, `importRawWorldbook` | 导入原始数据 |
| `version.d.ts` | `getTavernHelperVersion`, `getTavernVersion` | 版本信息 |

**iframe/目录 - 框架和插件接口:**

| 文件 | 主要接口 | 说明 |
|------|----------|------|
| `event.d.ts` | `eventOn`, `eventEmit`, `eventOnce`, `eventMakeFirst`, `eventMakeLast`, `eventRemoveListener`, `eventClearEvent`, `tavern_events`, `iframe_events` | 事件系统 |
| `exported.mvu.d.ts` | `Mvu` | MVU变量框架 |
| `exported.sillytavern.d.ts` | `SillyTavern` | 酒馆原生API |
| `exported.tavernhelper.d.ts` | `TavernHelper` | 酒馆助手API |
| `exported.ejstemplate.d.ts` | `EJS` | EJS模板引擎 |
| `script.d.ts` | `waitForInit` | 脚本框架初始化 |
| `variables.d.ts` | iframe变量操作 | iframe变量操作 |

### 4.3 接口使用示例

```typescript
// 变量操作
const variables = getVariables({ type: 'script' }); // 在脚本内自动获取当前脚本ID
replaceVariables(newVars, { type: 'script' });
updateVariablesWith(vars => { /* 处理 */ return vars; }, { type: 'script' });

// 消息处理
const messages = getChatMessages('0-{{lastMessageId}}');
await setChatMessages([{ message_id: 5, message: 'new content' }]);
await createChatMessages([{ role: 'user', message: 'Hello' }]);
await deleteChatMessages([5]);

// 获取最新楼层号
const lastId = getLastMessageId();

// 前端界面获取所在楼层号
const messageId = getCurrentMessageId(); // 在消息iframe内使用

// 角色卡操作
const charData = getCharData('current');
const avatarPath = getCharAvatarPath('current');

// 全局接口（需先初始化）
await waitGlobalInitialized('Mvu');
Mvu.getMvuData({ type: 'message', message_id: 'latest' });

// 事件监听
eventOn(tavern_events.MESSAGE_RECEIVED, (message_id) => {
  console.log('收到消息:', message_id);
});

// 生成内容
const result = await generate({ user_input: '你好', should_stream: true });

// 提示词注入
injectPrompts([{ id: 'custom', role: 'system', content: '你是助手', position: 'in_chat', depth: 0 }]);

// 重新加载iframe
reloadIframe();
```

---

## 5. 构建配置规范

### 5.1 webpack.config.ts（可修改，需谨慎）

- `webpack.config.ts` 是项目的构建配置文件，**允许修改，但必须谨慎**
- 该文件已配置好所有必要的loader、插件和优化选项，包括：
  - Vue Loader（用于Vue SFC编译）
  - TypeScript Loader（用于.ts/.tsx文件编译）
  - SCSS Loader（用于.scss文件编译和提取）
  - MiniCssExtractPlugin（用于CSS提取）
  - HtmlWebpackPlugin（用于HTML打包）
  - VueUse自动导入组件和指令
  - 代码混淆和压缩优化
- 修改此文件可能导致构建失败或功能异常，建议每次改动后立即本地构建验证

### 5.2 已配置的Loader和插件

- **Vue Loader** - 用于Vue SFC编译
- **TypeScript Loader** - 用于.ts/.tsx文件编译
- **SCSS Loader** - 用于.scss文件编译和提取
- **MiniCssExtractPlugin** - 用于CSS提取
- **HtmlWebpackPlugin** - 用于HTML打包
- **VueUse自动导入** - 自动导入组件和指令
- **代码混淆和压缩优化** - 混淆代码，提升性能

### 5.3 内置全局库

酒馆运行时已内置以下全局库，可直接使用：

- `Vue` - Vue 3 (`window.Vue`)
- `VueRouter` - Vue Router 4 (`window.VueRouter`)
- `$` / `jQuery` - jQuery 3 (`window.$/window.jQuery`)
- `_` - Lodash (`window._`)
- `toastr` - 消息提示 (`window.toastr`)
- `PIXI` - Pixi.js (`window.PIXI`)
- `YAML` - YAML解析 (`window.YAML`)
- `z` - Zod (`window.z`)

### 5.4 特殊导入方式

```typescript
// 1. 导入文件内容（原始字符串）
import html_content from './html.html?raw';
import json_content from './json.json?raw';

// 2. 导入HTML（最小化）
import html from './file.html';

// 3. 导入Markdown（解析为HTML）
import markdown from './file.md';

// 4. 导入Vue组件
import Component from './Component.vue';

// 5. 导入样式（自动插入<head>）
import './index.scss';

// 6. 导入打包后的脚本/样式（可在jQuery中使用）
=======
# 酒馆助手前端界面或脚本编写

本项目主要用于编写酒馆助手 ([Tavern Helper](https://n0vi028.github.io/JS-Slash-Runner-Doc/guide/关于酒馆助手/介绍.html)) 所支持的前端界面或脚本. 它们在酒馆 (SillyTavern) 中以前台或后台的形式运行, 可以在代码中直接使用酒馆助手所提供的接口, 进而:

- 为角色卡提供更好的 UI 显示, 如将消息楼层中原本只是代码块纯文本的状态栏美化为有动态效果、有交互的 html 状态栏
- 实现非纯文本的游玩体验, 如监听现实时间或酒馆事件来实现 meta 游戏、播放多媒体文件、自制游玩界面并与酒馆交互
- 优化酒馆使用体验, 如用 jQuery 为预设提示词条目新增复制按钮, 监听酒馆接收到消息事件并判断是否需要重新生成本楼层消息
- 连接外部应用程序, 如通过 socket.io-client 连接外部服务器, 进而实现外部应用程序与酒馆的通信
- 新增额外功能, 如每 20 楼在后台调用一次 LLM 来生成对之前剧情的总结
- ...

## 访问酒馆网页

在编写时, 你应该用 chrome-devtools 连接我已经打开的浏览器, 从中读取或操纵连接到的酒馆网页 (其网址与 `.vscode/launch.json` 中配置的 `url` 一致), 来了解当前的界面、脚本情况, 如获取当前的 DOM 情况、实际显示情况、Console 情况、点击界面……

连接到网页后, 你需要检查 `$('#extensions_settings')` 中的`酒馆助手-实时监听-允许监听`开关是否处于启用状态. 一旦启用, 则界面、脚本代码到酒馆网页的实时同步已经建立好了: 在代码变更后, 酒馆网页上将热重载新的脚本或界面代码, 因此你不需要刷新酒馆网页, 也不需要自己运行 `pnpm build` 来更新代码打包结果, 直接查看网页即可.

## 项目结构

### 核心机制: 前端界面或脚本

每个前端界面或脚本, 都以 `src` 文件夹或 `示例` 文件夹中的一个独立文件夹形式存在. 具体是前端界面还是脚本, 由文件夹中的内容直接决定:

- 如果文件夹中既有 `index.ts` 文件也有 `index.html` 文件, 则是前端界面项目. 例如, `示例/界面示例` 是一个前端界面项目.
- 如果文件夹中仅有 `index.ts` 文件, 则是脚本项目. 例如, `示例/脚本示例`、`示例/流式楼层界面示例` 是一个脚本项目.

你可以在 `初始模板/*/新建为src文件夹中的文件夹` 中找到前端界面和脚本项目的初始模板.

### 流式楼层界面

由于酒馆框架限制, 前端界面只能在它所基于的文本格式输出完毕后才能渲染, 也就是说前端界面的渲染不支持流式文本 (AI 逐渐输出文本供用户阅读).

为了让前端界面支持流式, 本编写模板的[进阶技巧](https://stagedog.github.io/青空莉/工具经验/实时编写前端界面或脚本/进阶技巧/)中提出了两种方法, 简单地说: (具体需要查看进阶技巧文章)

- 不再使用酒馆的输入框, 让玩家始终在一个渲染好的前端界面里游玩, 而在前端界面内使用酒馆助手提供的 `generate` 或 `generateRaw` 请求 AI 生成新的回复.
- 继续使用酒馆的输入框, 但利用脚本可以使用 jquery 操纵酒馆网页的特性, 替换掉酒馆原本不支持流式前端界面渲染的楼层显示.

流式楼层界面即使用了第二种方法. 在 `util/streaming.ts` 中, 项目提供了 `mountStreamingMessage` 函数来挂载流式楼层界面. 此外, 在 `示例/流式楼层界面示例` 中, 你可以找到一个流式楼层界面的示例.

**流式楼层界面不过是调用了 `mountStreamingMessage` 的脚本, 因此所有脚本的编写规则依旧适用.**

### MVU 角色卡

如果我要求你制作一张基于 MVU 的角色卡, 你应该参考本项目提供在 `示例/角色卡示例` 中的额外支持:

- `示例/角色卡示例/脚本/*/` 中是角色卡的所有脚本
- `示例/角色卡示例/界面/*/` 中是角色卡的所有前端界面
- `示例/角色卡示例/schema.ts` 中是用 zod 4 库书写的角色卡 MVU 变量结构定义
  - 提供给脚本、前端界面导入使用
  - 会在 `pnpm build` 或 `pnpm watch` 时生成对应的 json schema 文件 `示例/角色卡示例/schema.json`, 便于编写变量初始值文件 initvar.yaml `# yaml-language-server: $schema=schema文件路径`
- `util/mvu.ts` 中提供了 `defineMvuDataStore` 函数, 它基于 pinia 实现了本项目推荐的前端界面获取、修改 MVU 变量方式, 支持与酒馆实际变量之间的双向同步; `示例/角色卡示例/界面/store.ts` 中的 `useDataStore` 就是用它获取和修改界面所在楼层变量的.

你同样可以在 `初始模板/角色卡/新建为src文件夹中的文件夹` 中找到 MVU zod 角色卡的初始模板.

## 项目参考文件

### 可用的第三方库

项目使用 pnpm 作为包管理器, 在 `package.json` 的 `dependencies` 部分定义了可用的第三方库 (dedent、gsap、jquery、jquery-ui、lodash、pinia、pixi.js、toastr、yaml、vue、vue-router、@vueuse/core、react、@pixi/react、async-wait-until、zod), 你也可以自己通过 `pnpm add` 添加更多第三方库, 如添加 (@vueuse/integrations 等).

前端界面或脚本都是在浏览器中使用, 因此你不能使用 nodejs 库

### 与酒馆交互的方式

前端界面或脚本主要使用酒馆助手所提供的接口与酒馆进行交互. 这些接口定义在 `@types` 文件夹中, 如 `@types/function/worldbook.d.ts` 中描述了该如何操控世界书, `@types/function/variables.d.ts` 中描述了该如何操控酒馆变量.

此外, `@types` 文件夹也为酒馆本身、其他插件、MVU 变量框架所提供的接口变量、函数进行了类型定义, 如 `@types/iframe/exported.mvu.d.ts` 中描述了 MVU 变量框架所提供的接口 `Mvu`.

除了代码接口外, 酒馆自制了 STScript 命令. 要将这些命令转换为 Typescript 代码, 你需要使用 `@types/function/slash.d.ts` 内所定义的 `triggerSlash` 函数来调用它们. 具体的命令列表见于 `slash_command.txt` 文件.

以上接口在代码中均可直接使用, 不需要导入或新定义它们, 也不需要检查是否可用.

#### 酒馆助手接口

`@types` 文件夹中定义了酒馆助手所提供的所有接口, [酒馆助手官方文档](https://n0vi028.github.io/JS-Slash-Runner-Doc/)中也对这些接口进行了类似的说明:

其中, `@types/function` 中的接口将会导出到酒馆网页的 `window.TavernHelper`; 而 `@types/iframe` 依赖于 iframe 环境, 只在酒馆助手前端界面或脚本内可用. 由于本项目主要是制作酒馆助手前端界面或脚本, `@types/function` 和 `@types/iframe` 内的接口均可直接调用, 你无须在意 `@types/function` 和 `@types/iframe` 的区别.

- `@types/function/audio.d.ts`: 音频播放器
- `@types/function/builtin.d.ts`: 对 `@types/iframe/exported.sillytavern.d.ts` 的增补, 一些酒馆原生具有但没有导出的接口
- `@types/function/chat_message.d.ts`: 操作目前酒馆玩家与 AI 的聊天楼层记录, 如获取某些楼层的消息、修改楼层消息内容、新建楼层、删除楼层、移动楼层等
- `@types/function/displayed_message.d.ts`: 操作目前酒馆网页对楼层的显示, 如获取某一楼层的 JQuery 实例、将文本格式化为如果放在楼层中会如何显示的 html 文本等
- `@types/iframe/event.d.ts`: 监听、发送酒馆事件, 如监听消息接收完毕、监听世界书发生更新等
- `@types/iframe/exported.ejstemplate.d.ts`: 与提示词模板这一酒馆插件进行交互, 主要是调整提示词模板的设置. 除非我明确要求你做, 不要考虑
- `@types/iframe/exported.mvu.d.ts`: 与 MVU 变量框架进行交互
- `@types/iframe/exported.sillytavern.d.ts`: 酒馆原生导出的接口, 但抽象层次很低, 因此你应该优先使用 `@types` 中列出的其他酒馆助手接口而不是这个文件里的
- `@types/function/extension.d.ts`: 操作酒馆第三方扩展的安装、卸载、更新等
- `@types/function/generate.d.ts`: 请求酒馆 AI 生成回复. `generate` 是携带酒馆预设作为提示词的请求 AI 生成, 而 `generateRaw` 是不携带酒馆预设 (但依旧会发送酒馆世界书条目等内容) 直接请求 AI 生成
- `@types/function/global.d.ts`: 支持不同前端界面、脚本间的接口共享
- `@types/function/import_raw.d.ts`: 导入酒馆原生数据, 包括角色卡、聊天记录、世界书、预设等. 导入所用的数据格式应与玩家通过酒馆页面按钮导出的数据格式一致
- `@types/function/inject.d.ts`: 为酒馆 AI 请求注入额外提示词
- `@types/function/macro_like.d.ts`: 注册酒馆助手宏. 注册后, 酒馆 AI 提示词、酒馆楼层显示中出现这个宏时, 将会被替换为宏所定义的内容
- `@types/function/preset.d.ts`: 操作酒馆预设, 可以切换使用别的预设, 也可以调整预设中的酒馆 AI 请求参数 (温度、流式传输等) 和提示词等
- `@types/function/raw_character.d.ts`: 获取角色卡的一些信息
- `@types/function/script.d.ts`: 获取或修改当前酒馆助手脚本的某些信息
- `@types/iframe/script.d.ts`: 获取或修改当前酒馆助手脚本的某些信息
- `@types/function/slash.d.ts`: 运行酒馆的 DSL 命令 (称为 "/STScript"), 可运行的命令在 `slash_command.txt` 中有列出, 但这些命令很难与代码结合使用,因此你应该优先使用 `@types` 中列出的其他酒馆助手接口而不是 "/STScript" 命令
- `@types/function/tavern_regex.d.ts`: 操作酒馆正则. 酒馆在发送 AI 请求或显示楼层时, 会按酒馆正则将聊天记录中的内容替换成其他内容. 除非明确要求, 你只应该在有些时候使用这个文件里的 `formatAsTavernRegexedString` 函数
- `@types/function/util.d.ts`: 一些工具函数, 如获取当前酒馆聊天的最新楼层号, 替换文本里的酒馆宏等
- `@types/iframe/util.d.ts`: 一些工具函数, 如在前端界面里获取前端界面所在楼层号等
- `@types/function/variables.d.ts`: 操作酒馆变量, 可以获取或修改变量值
- `@types/iframe/varriables.d.ts`: 操作酒馆变量
- `@types/function/version.d.ts`: 获取酒馆和酒馆助手的版本号
- `@types/function/worldbook.d.ts`: 操作世界书, 可以删除创建世界书, 可以调整世界书启用情况, 也可以调整其中的条目等

### 工具函数

在 `util` 中定义了一些工具函数:

- `util/script.ts`: 脚本可能使用的函数
- `util/common.ts`: 前端界面或脚本可能使用的函数
- `util/mvu.ts`: MVU 角色卡可能使用的函数

## 酒馆变量

酒馆变量可用于持久化地存储前端界面、脚本的数据, 可通过酒馆助手的 `getVariables`、`replaceVariables` 等接口读写.

- 全局变量 (`{type: 'global'}`): 在酒馆中全局一致, 无论是否打开角色卡、哪张角色卡, 都共享同样的全局变量.
- 角色卡变量 (`{type: 'character'}`): 绑定在角色卡上的变量.
- 脚本变量 (`{type: 'script', script_id: string}`): 绑定在某个脚本上的变量.
- 聊天变量 (`{type: 'chat'}`): 绑定在某角色卡的某个聊天文件上的变量. 当在酒馆中选择某张角色卡与 LLM 进行对话时, 都需要创建一个聊天文件.
- 消息楼层变量 (`{type: 'message', message_id: 'latest'|number}`): 绑定在某角色卡、某聊天的某个楼层上. 当在酒馆中用某个聊天文件与 LLM 进行对话时, 可能会逐渐有很多用户输入和 AI 输出, 每个用户输入和 AI 输出都是单独的消息楼层.

## 特殊导入方式

### 导入文件内容

项目支持用 `import string from './文件?raw'` 来将文件内容作为字符串导入.

如果导入的文件是 typescript、scss, 则导入的将会是经过 webpack 打包后的纯 javascript、css 而不是原始内容, 因此能在 jquery 中直接使用.

```typescript
// 直接导入文件内容
import html_content from './html.html?raw';
import json_content from './json.json?raw';

// 经过 webpack 打包后导入
>>>>>>> 9072edeaaddd1166c92d20e75542e4d14d4fdbc2
import javascript_content from './script.ts?raw';
import css_content from './style.scss?raw';
```

<<<<<<< HEAD
### 5.5 SillyTavern 正则替换粘贴规范（重要）

> 适用场景：你想把 `dist/**/index.html` 的整份内容粘贴到酒馆「正则脚本/正则替换」的“替换为”输入框里（通常会用到 `$1` 占位注入）。

- **禁止**直接粘贴 `dist/**/index.html`：酒馆会将替换内容序列化为 JSON 字符串保存，JSON 会自动反转义 `\n`/`\t`/`\r`/`\b`/`\uXXXX` 等序列，导致打包脚本中的字符串/正则被破坏，最终在酒馆控制台出现 `Invalid or unexpected token` 并渲染空白。
- **必须**改用 `dist/**/paste.html`：该文件由构建后脚本自动生成，保留 `$1` 注入位，同时将内联脚本包装为 base64 运行时解码执行，避免 JSON 反转义与 `$1` 误替换问题。
- **如果你不需要“整页粘贴”**，优先用 URL 加载方式（推荐）：把 `dist/**/index.html` 上传到可访问地址（如 jsdelivr 或本地静态服务器），再用 jQuery `$('...').load(url)` 或使用同目录的 `dist/**/loader.js` 进行加载。
- **更推荐的规避方式（从根上减少注入）**：对于“消息楼层 iframe”界面，不要把正文/选项用 `$1` 注入到 HTML 里，改用 `getCurrentMessageId()` 定位当前楼层，再用 `getChatMessages(message_id)` 读取该楼层消息文本并解析 `<content>/<option>`；这样基本不再依赖“整页粘贴”，也就不会触发 JSON 反转义破坏脚本的问题。

**影响说明（提前告知）**
- `paste.html` 的功能行为与原 `index.html` 等价，但会增加一次 base64 解码与脚本重建开销；在性能较弱的移动端首帧可能更慢，不建议频繁重复注入同一界面。
- 如果你把数据注入从 `$1` 切换为 `getChatMessages` 读取：界面将以“聊天记录里保存的楼层消息”为唯一数据源；因此楼层消息本身必须包含 `<content>/<option>` 等标签（而不是只存在于正则替换结果里），否则界面会显示为空。

---

## 6. 酒馆变量系统

### 6.1 变量类型

酒馆变量用于持久化存储前端界面、脚本的数据，可通过酒馆助手的`getVariables`、`replaceVariables`等接口读写。

| 类型 | type值 | 说明 |
|------|--------|------|
| 全局变量 | `'global'` | 在酒馆中全局一致 |
| 角色卡变量 | `'character'` | 绑定在当前角色卡上 |
| 聊天变量 | `'chat'` | 绑定在当前聊天文件上 |
| 消息楼层变量 | `'message'` | 绑定在特定楼层上，需指定`message_id` |
| 脚本变量 | `'script'` | 绑定在特定脚本上 |
| 扩展变量 | `'extension'` | 绑定在特定扩展上，需指定`extension_id` |

### 6.2 使用示例

```typescript
// 读取变量
const globalVars = getVariables({ type: 'global' });
const charVars = getVariables({ type: 'character' });
const chatVars = getVariables({ type: 'chat' });
const messageVars = getVariables({ type: 'message', message_id: 5 });
const scriptVars = getVariables({ type: 'script' }); // 当前脚本

// 写入变量
replaceVariables({ key: 'value' }, { type: 'global' });

// 更新变量
updateVariablesWith(vars => {
  _.set(vars, 'path.to.value', newValue);
  return vars;
}, { type: 'chat' });

// 插入或修改变量
insertOrAssignVariables({ newKey: 'newValue' }, { type: 'chat' });

// 删除变量
deleteVariable('path.to.key', { type: 'chat' });

// 使用Zod进行数据校验
const Settings = z.object({
  button_selected: z.boolean().default(false)
}).prefault({});
const settings = Settings.parse(getVariables({ type: 'script', script_id: getScriptId() }));
```

---

## 7. 前端界面开发

### 7.1 项目判定

如果`src/xxx`文件夹中既有`index.ts`文件也有`index.html`文件，则它是前端界面项目。

前端界面以iframe的形式在酒馆消息楼层中前台显示，有一个自己的界面。

### 7.2 index.html规范

前端界面的`index.html`仅可填写静态`<body>`内容，不得引用项目中其他文件：

```html
<head>
  <!-- 保留空白，webpack打包时会插入样式、脚本等 -->
</head>
<body>
  <!-- 这里写<div>、<span>等静态内容 -->
  <!-- 也可以只写<div id="app"></div>交给vue渲染 -->
</body>
```

**禁止事项:**
- ❌ 禁止使用`<link>`导入样式
- ❌ 禁止使用`<script>`引用本地脚本
- ❌ 禁止使用`<img src="">`占位

### 7.3 样式规范

**简单样式:**
- 可在index.html中直接使用TailwindCSS
- 需要新建`@import 'tailwindcss'`的CSS文件并导入

**复杂样式:**
- 优先使用Vue组件的`<style lang="scss">`标签
- 或在TypeScript中`import './index.scss'`

### 7.4 iframe适配要求

- ❌ 禁止使用`vh`等受宿主高度影响的单位
- ✅ 使用`width`和`aspect-ratio`让高度动态调整
- ❌ 避免使用`min-height`、`overflow: auto`等强制撑高父容器的元素
- ✅ 页面整体应适配容器宽度，不产生横向滚动条
- ✅ 优先卡片形状，无背景颜色（除非明确要求）

### 7.5 正确加载/卸载

```typescript
// ✅ 正确：使用jQuery初始化
$(() => {
  toastr.success('界面加载成功！');
  createApp(App).use(router).mount('#app');
});

// ✅ 正确：使用jQuery和pagehide事件卸载
$(window).on('pagehide', () => {
  toastr.info('界面已卸载');
});

// ❌ 错误：使用DOMContentLoaded
document.addEventListener("DOMContentLoaded", fn);

// ❌ 错误：在全局作用域执行代码
toastr.success('这会在每次导入时执行');
```

### 7.6 Vue开发规范

```typescript
// 优先使用Vue编写界面
// Vue Router必须使用createMemoryHistory()
const router = createRouter({
  history: createMemoryHistory(),
  routes: [...]
});

// 监听Vue响应式数据变化并同步到酒馆数据
watchEffect(() => {
  replaceVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
});

// 状态管理使用Pinia
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));
  watchEffect(() => {
    replaceVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });
  return { settings };
});
```

### 7.7 获取界面所在楼层号

```typescript
// 前端界面中获取所在楼层的楼层号（推荐）
const message_id = getCurrentMessageId(); // 在消息iframe内使用

// 或者通过iframe名称获取
const message_id = getMessageId(getIframeName());
```

---

## 8. 脚本开发

### 8.1 项目判定

如果`src/xxx`文件夹中仅有`index.ts`文件，则它是脚本项目。

脚本以iframe的形式在酒馆后台运行，没有自己的界面，只有代码部分可供编写。

### 8.2 jQuery使用

脚本中的jQuery直接作用于整个酒馆页面而非仅作用于脚本所在的iframe：

```typescript
// ✅ 选择酒馆页面的body
$('body')

// ❌ 选择脚本iframe的body
$(document.body)
```

### 8.3 Vue组件挂载

当需要在脚本中向酒馆页面挂载Vue组件时：

```typescript
// 使用jQuery创建挂载位置
const $app = $('<div id="app"></div>');
$('body').append($app);

// 挂载Vue组件
app.mount($app[0]);
```

### 8.4 样式处理

由于脚本运行在iframe中，样式仅会应用于iframe内。向酒馆网页添加DOM时，需要将样式复制到酒馆网页的`<head>`中：

```typescript
export function teleport_style() {
  $(`<div>`)
    .attr('script_id', getScriptId())
    .append($(`head > style`, document).clone())
    .appendTo('head');
}

export function deteleport_style() {
  $(`head > div[script_id="${getScriptId()}"]`).remove();
}
```

### 8.5 脚本设置

使用脚本变量和Zod为用户提供自定义设置：

```typescript
const Settings = z.object({
  button_enabled: z.boolean().default(false),
  theme: z.enum(['light', 'dark']).default('light')
}).prefault({});

const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));
```

### 8.6 按钮功能

脚本可以注册按钮事件：

```typescript
// 获取按钮事件类型
const eventType = getButtonEvent('按钮名');
eventOn(eventType, () => {
  console.log('按钮被点击了');
});

// 获取脚本按钮列表
const buttons = getScriptButtons();

// 替换按钮列表
replaceScriptButtons([
  { name: '开始', visible: true },
  { name: '设置', visible: true }
]);

// 追加不存在的按钮
appendInexistentScriptButtons([
  { name: '重新开始', visible: true }
]);
```

### 8.7 脚本信息

```typescript
// 获取脚本作者注释
const info = getScriptInfo();

// 替换脚本作者注释
replaceScriptInfo('新的脚本描述');
```

---

## 9. MVU变量框架

### 9.1 概述

MVU变量框架是一个独立的酒馆助手脚本，作用于消息楼层变量。它允许：
- 在世界书中设置消息楼层变量
- 在世界书或聊天记录中初始化消息楼层变量
- 用AI输出更新消息楼层变量

### 9.2 使用流程

```typescript
// 1. 等待初始化（必须）
await waitGlobalInitialized('Mvu');

// 2. 读取MVU数据
const data = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
// 或获取当前界面所在楼层的数据
const data = Mvu.getMvuData({ type: 'message', message_id: getMessageId(getIframeName()) });

// 3. 自行解析MVU命令（用于generate等不自动解析的场景）
const result = await Mvu.parseMessage(messageString, oldData);

// 4. 写回数据
await Mvu.replaceMvuData(newData, { type: 'message', message_id: 'latest' });

// 5. 重新加载初始变量
await Mvu.reloadInitVar(data);
```

### 9.3 事件系统

MVU提供以下事件：

```typescript
// 新开聊天对变量初始化时触发
eventOn(Mvu.events.VARIABLE_INITIALIZED, (variables, swipe_id) => {
  // variables: MvuData
  // swipe_id: swipes索引
});

// 某轮变量更新开始时触发
eventOn(Mvu.events.VARIABLE_UPDATE_STARTED, (variables) => {
  // variables: MvuData（更新前的数据）
});

// 对文本成功解析了所有更新命令时触发
eventOn(Mvu.events.COMMAND_PARSED, (variables, commands, message_content) => {
  // variables: MvuData
  // commands: 命令信息数组
  // message_content: 原始消息内容
});

// 某轮变量更新结束时触发
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (variables, variables_before_update) => {
  // variables: 更新后的MvuData
  // variables_before_update: 更新前的MvuData
});

// 即将用更新后的变量更新楼层时触发
eventOn(Mvu.events.BEFORE_MESSAGE_UPDATE, ({ variables, message_content }) => {
  // variables: MvuData
  // message_content: 将要更新到楼层的消息内容
});
```

### 9.4 数据结构

```typescript
type MvuData = {
  /** 已被mvu初始化initvar条目的世界书列表 */
  initialized_lorebooks: string[];
  /** 实际的变量数据 */
  stat_data: Record<string, any>;
};

type CommandInfo =
  | { type: 'set'; full_match: string; args: [path, new_value] | [path, expected_old, new_value]; reason: string }
  | { type: 'insert'; full_match: string; args: [path, value] | [path, index, value]; reason: string }
  | { type: 'delete'; full_match: string; args: [path] | [path, key]; reason: string }
  | { type: 'add'; full_match: string; args: [path, delta]; reason: string };
```

---

## 10. Chrome DevTools MCP

### 10.1 概述

Chrome DevTools MCP通过Model Context Protocol (MCP)为AI助手提供完整的Chrome DevTools功能访问权限，提供**6大类共26个工具功能**。

### 10.2 工具分类

#### 10.2.1 Input automation (8个工具) - 输入自动化

- `click` - 点击指定元素
- `drag` - 拖拽元素到目标位置
- `fill` - 在输入框输入文本或选择下拉选项
- `fill_form` - 批量填充多个表单元素
- `handle_dialog` - 处理浏览器弹出的对话框
- `hover` - 悬停在指定元素上
- `press_key` - 按键或组合键操作
- `upload_file` - 通过元素上传文件

#### 10.2.2 Navigation automation (6个工具) - 导航自动化

- `close_page` - 关闭指定索引的页面
- `list_pages` - 获取所有打开的页面列表
- `navigate_page` - 导航到URL或历史操作
- `new_page` - 创建新页面
- `select_page` - 选择页面作为上下文
- `wait_for` - 等待指定文本在页面上出现

#### 10.2.3 Emulation (2个工具) - 模拟

- `emulate` - 模拟CPU和网络条件
- `resize_page` - 调整页面窗口大小

#### 10.2.4 Performance (3个工具) - 性能分析

- `performance_analyze_insight` - 分析性能跟踪中的特定洞察
- `performance_start_trace` - 开始性能跟踪记录
- `performance_stop_trace` - 停止性能跟踪记录

#### 10.2.5 Network (2个工具) - 网络请求

- `get_network_request` - 获取指定的网络请求
- `list_network_requests` - 列出所有网络请求

#### 10.2.6 Debugging (5个工具) - 调试

- `evaluate_script` - 在当前页面执行JavaScript函数
- `get_console_message` - 根据ID获取控制台消息
- `list_console_messages` - 列出所有控制台消息
- `take_screenshot` - 截取页面或元素截图
- `take_snapshot` - 获取页面的文本快照（基于无障碍树）

### 10.3 典型工作流程

```typescript
// 1. 获取页面快照（获取元素uid）
take_snapshot({ verbose: true });

// 2. 导航到指定URL
navigate_page({ type: 'url', url: 'https://example.com' });

// 3. 等待页面加载
wait_for({ text: '欢迎', timeout: 5000 });

// 4. 填充表单
fill_form({
  elements: [
    { uid: 'element-1', value: '用户名' },
    { uid: 'element-2', value: '密码' }
  ]
});

// 5. 点击提交按钮
click({ uid: 'submit-button' });

// 6. 截取结果截图
take_screenshot({ format: 'png', fullPage: true });
```

---

## 11. 最佳实践

### 11.1 代码规范

**优先使用TypeScript而非JavaScript**
- ✅ 使用TypeScript提供更好的类型检查
- ✅ 利用接口定义和类型推断
- ❌ 避免使用any类型

**优先使用酒馆助手提供的接口**
- ✅ 使用`getChatMessages()`而非`SillyTavern.chat`
- ✅ 使用`getLorebookSettings()`而非直接操作酒馆变量
- ✅ 酒馆助手接口抽象层次更高，更符合TypeScript类型系统

### 11.2 数据管理

**使用Pinia + Zod管理状态**

```typescript
// 用Zod定义类型和默认值
const Settings = z.object({
  button_selected: z.boolean().default(false)
}).prefault({});

// 使用Pinia实现响应式读写
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));

  watchEffect(() => {
    replaceVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });

  return { settings };
});
```

**去除Proxy层**

```typescript
// 当需要监听Vue响应式数据变化并存入酒馆数据时
watchEffect(() => {
  replaceVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
});
```

### 11.3 界面开发

**优先使用Vue编写界面**
- ✅ Vue比jQuery或DOM操作更简单
- ✅ 可使用Pinia、VueRouter和其他第三方库
- ❌ Vue Router的createRouter()不能写在`$(() => {})`中，必须在全局执行

**Vue Router配置**

```typescript
// ✅ 正确：使用createMemoryHistory()
const router = createRouter({
  history: createMemoryHistory(),
  routes: [...]
});
```

**多媒体资源处理**

```typescript
// 当有很多多媒体资源时，使用@pixi/react在.tsx中编写界面
// 使用pixi.js实现资源预先加载
```

### 11.4 重载机制

```typescript
// 完全重载前端界面或脚本（简单方式）
let chat_id = SillyTavern.getCurrentChatId?.();
eventOn(tavern_events.CHAT_CHANGED, (new_chat_id) => {
  if (chat_id !== new_chat_id) {
    chat_id = new_chat_id;
    reloadIframe(); // ✅ 推荐：使用reloadIframe()代替window.location.reload()
  }
});

// 或者使用window.location.reload()（功能相同，但会重置所有全局状态）
window.location.reload();
```

### 11.5 @pixi/react使用场景

```typescript
// 当有很多多媒体资源时，前端界面更像是一个完整的游戏
// 应该使用@pixi/react在.tsx中编写界面
// 并使用pixi.js实现资源预先加载等逻辑
```

---

## 12. 高级技巧

### 12.1 资源与CDN

- 首选 `https://testingcf.jsdelivr.net` 访问npm/GitHub资源
- 新增依赖优先用 `pnpm add` 让模板自动转CDN
- 免费字体可用 ZeoSeven Fonts，图标用 FontAwesome
- 注意色彩对比度，推荐 Adobe 色彩对比度检查器

### 12.2 前端界面职责

前端界面仅负责定位插入位置，不解析数据。数据解析在代码中使用 `getChatMessages` 等完成。可在 `.cursor/rules` 中追加自定义辅助规则扩展提示。

### 12.3 性能与加载

- 为减轻酒馆渲染卡顿，可把大块HTML换成外链加载
- 若需发布可自动更新的界面/脚本，使用 GitHub + jsdelivr 镜像域名
- 即使模板提到删除 `LimitChunkCountPlugin` 以分割，也请在充分理解影响后再调整

### 12.4 设计与原型

建议先用 Figma 做原型（可配合 Figma MCP），再按设计还原。保持移动端友好与高对比度可读性。

### 12.5 外部通信

可用 `socket.io-client` 等浏览器库与外部应用通信，大批量数据注意服务端 `maxHttpBufferSize`。

### 12.6 酒馆功能速查

@types 列出全部可用接口，先查文档/类型再编码，避免重复造轮子。

### 12.7 jQuery操作宿主

脚本可直接改酒馆页面元素，也可用 `tavern_events.CHAT_COMPLETION_PROMPT_READY` 等事件原地改提示词。数组需原地修改（如 `splice`），不要整体替换。

### 12.8 流程与流式界面

简单方案在前端界面内用 `generate` + `iframe_events.STREAM_TOKEN_RECEIVED_*` 做流式。进阶可隐藏原楼层，自建流式并监听 `MESSAGE_SEND`/`STREAM_TOKEN_RECEIVED`/`MESSAGE_RECEIVED`。

### 12.9 文件与构建选项

可用 `import './file?raw'` 直接拿本地文本。`// @obfuscate` 触发混淆，`// @no-ci` 可让模板 CI 跳过打包（谨慎使用，本仓库仍按需执行）。

---

## 📚 参考资料

### 官方文档

- [酒馆助手介绍](https://n0vi028.github.io/JS-Slash-Runner-Doc/guide/关于酒馆助手/介绍.html)
- [MVU变量框架](https://github.com/MagicalAstrogy/MagVarUpdate)
- [Chrome DevTools官方文档](https://developer.chrome.com/docs/devtools/)
- [Puppeteer文档](https://puppeteer.github.io/puppeteer/)
- [MCP协议规范](https://modelcontextprotocol.io/)

### 项目文件

- `/src/APP/` - 实际项目示例
- `/src/界面示例/` - 前端界面模板
- `/src/脚本示例/` - 脚本项目模板
- `/模板/**/新建为src文件夹中的文件夹` - 项目模板
- `/@types/` - 酒馆助手和酒馆API类型定义
- `/slash_command.txt` - STScript命令列表

### 关键配置文件

- `/webpack.config.ts` - 构建配置文件
- `/package.json` - 依赖管理
- `/pnpm-lock.yaml` - 锁定版本

---

## ⚠️ 重要注意事项

1. **谨慎修改webpack.config.ts** - 构建配置文件已优化，修改可能导致构建失败
2. **禁止超出@types接口** - 所有开发必须使用@types中定义的接口
3. **正确使用加载/卸载时机** - 使用jQuery而非DOMContentLoaded
4. **Vue Router必须使用MemoryHistory** - 前端界面和脚本都是iframe
5. **样式隔离处理** - 脚本向酒馆添加DOM时需特殊处理样式
6. **安全警告** - Chrome调试端口打开时避免浏览敏感网站
7. **使用waitGlobalInitialized** - 使用MVU等全局接口前必须先等待初始化
8. **iframe专用函数** - `getCurrentMessageId()` 只能在消息iframe内使用，`getScriptId()` 只能在脚本内使用
9. **重载选择** - 推荐使用 `reloadIframe()` 代替 `window.location.reload()`

---

**文档版本**: v2.1
**最后更新**: 2026-01-03
**维护者**: 酒馆助手开发团队

---

> 💡 **提示**: 本文档为AI助手专用开发规范，遵循此规范可以确保与酒馆助手的完美兼容性和最佳性能表现。
=======
### 导入 html

除了以 `?raw` 直接导入 HTML 文件内容外, 项目还支持用 `import html from './文件.html'` 来通过 html-loader 将 html 文件内容最小化后作为字符串导入.

### 导入 markdown

项目还支持用 `import markdown from './文件.md'` 来通过 remark-loader 将 markdown 文件内容解析为 html 后作为字符串导入.

### 导入 vue

项目直接支持用 `import Component from './文件.vue'` 来导入 vue 组件, 如果要设计界面你应该优先使用 vue 组件 (含 pinia 和 vue-router).

### 为前端界面导入样式

前端界面支持在 typescript 中 `import './index.scss'` 来导入全局 scss 文件, 并自动将它们打包到最终的 `dist/**/index.html` 中的 `<head>` 部分.

## 最佳实践

通用于前端界面和脚本:

### 使用 typescript 而非 javascript

typescript 更容易写对, 你应该使用 typescript 而非 javascript

### 尽量使用项目参考文件中的功能

项目参考文件中的功能往往更为简单正确, 因此你应该尽量使用它们. 例如:

- 尽量使用第三方库, 例如:
  - 使用 jquery 而不是 javascript 内置的 DOM 操作
  - 使用 jqueryui 实现拖动效果 (vue 中则使用 vueuse 等第三方库)
  - 使用 zod 处理数据校验和纠错而不是 if else, 并用 `z.prettifyError()` 来格式化错误信息
  - 使用 gsap 制作打字机等所有动画效果
  - ...
- 尽量使用酒馆助手给出的接口, 例如:
  - 使用 `getIframeName()` 而不是 `(this.frameElement as Element).id`
  - ...

### 优先使用酒馆助手提供的接口

**酒馆助手所提供的接口抽象层次更高, 你应该优先使用 `@types` 文件夹中其他文件定义的酒馆助手接口**, 而不是 `@types/iframe/exported.sillytavern.d.ts` 中定义的酒馆内置接口或 STScript 命令.

- 使用 `@types/function/chat_message.d.ts` 中定义的 `getChatMessages()`、`setChatMessages()` 等来获取、修改消息楼层
- 使用 `@types/function/worldbook.d.ts` 中定义的 `getWorldbook()`、`replaceWorldbook()` 等来获取、修改世界书条目
- 使用 `@types/function/variables.d.ts` 中定义的 `getVariables()`、`replaceVariables()` 等来获取、修改酒馆变量
- ……

### 优先使用 vue 编写界面

vue 相比于 jquery 或 DOM 操作更为简单, 因此你应该尽量使用 vue (可使用 pinia、vue-router 或自己添加其他第三方库) 来编写前端界面, 但要注意 vue-router 的 `createRouter()` 不能写在 `$(() => {})` 中, 必须在全局执行.

当需要监听 vue 的响应式数据变化并存入酒馆数据时 (如酒馆变量、世界书……), 你应该先用 `klona()` 来去除 proxy 层, 以在脚本中编写 vue 并提供用户设置为例:

```typescript
const Settings = z.object({/*...*/}); // 用 zod 定义设置的类型和默认值
const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));
watchEffect(() => replaceVariables(klona(settings.value), { type: 'script', script_id: getScriptId() }));
```

前端界面和脚本都是 iframe, 因此你在使用 vue-router 时, 应该使用 `history: createMemoryHistory()` 来创建路由, 否则将无法正常路由.

### 优先使用 pinia、zod 管理数据状态

当需要从酒馆读取配置/数据时, 你应该用 pinia 实现响应式读写:

```typescript
const Settings = z.object({ button_selected: z.boolean().default(false) }).prefault({});
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));
  watchEffect(() => {
    replaceVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });
  return { settings };
});
```

### 优先使用 tailwindcss 和 `<style scoped>` 进行样式设计

你可以直接在项目中使用 tailwindcss, 而无需导入任何 css 文件.

在设计样式时, 你应该优先使用 tailwindcss 直接在 vue 组件的 `<template>` 内书写, 对于无法这样做的情况则使用 `<style scoped>` 标签.

### 尝试使用 @pixi/react 编写界面

当有很多多媒体资源时, 我们的前端界面更像是一个完整的游戏, 因此你应该使用 @pixi/react 在 .tsx 中编写界面, 并使用 pixi.js 来实现资源预先加载等逻辑.

### 正确在加载、卸载前端界面或脚本时执行功能

你应该总是在加载时才执行代码, 而不该直接在全局作用域中执行代码.

项目最终打包生成的 `dist/**/index.html` 或 `dist/**/index.js` 可能先上传到网上, 再以 `$('body').load(网络链接)` 或 `import '网络链接'` 的方式加载到酒馆中. `document.addEventListener("DOMContentLoaded", fn)` 在这个加载过程中不会被触发, 因此禁止使用 `DOMContentLoaded` 作为加载时的执行时机.

你应该使用 jquery 来在加载时执行功能:

```typescript
$(() => {
  toastr.success('加载成功');
});
```

同样地, 使用 jquery 及 `'pagehide'` 事件 (而不是 `'unload'`) 来在卸载时执行功能:

```typescript
$(window).on('pagehide', () => {
  toastr.success('卸载成功');
});
```

### 使用 console、throw 和 errorCatched 合理记录日志和错误

你应该在代码的关键节点使用 `console.info` 简洁地记录日志, 并尽量保持日志与最新代码逻辑的一致性.

对于可恢复的错误, 使用 `console.warn`、`console.error` 记录日志;

对于让前端界面、脚本无法继续使用的错误, 你应该使用 `throw Error`, 而用 errorCatched 转换顶部函数从而对其进行记录, 例如:

```typescript
function init() { /*... */}

$(() => {
  errorCatched(init)();
})
```

### 重载前端界面或脚本

如果有完全重载前端界面或脚本的需求, 你应该使用 `window.location.reload()`. 如聊天文件变更时重新载入前端界面或脚本, 你可以用 `util/script.ts` 中定义好了的工具函数:

```ts
export function reloadOnChatChange(): EventOnReturn {
  let chat_id = SillyTavern.getCurrentChatId();
  return eventOn(tavern_events.CHAT_CHANGED, new_chat_id => {
    if (chat_id !== new_chat_id) {
      chat_id = new_chat_id;
      window.location.reload();
    }
  });
}
```
>>>>>>> 9072edeaaddd1166c92d20e75542e4d14d4fdbc2
