# 小手机一体化（寒冬）

把运行时、平台组件、通用主适配器和寒冬适配器，共 10 个入口打包进一个酒馆助手脚本。手机仍由寒冬适配器取得 owner 并创建唯一外壳；60、70 和通用 90 按现有依赖图待命。

## 安装

1. 在酒馆助手中关闭旧的小手机平台分散脚本、旧总成及单独的寒冬适配器。
2. 导入
   `dist/小手机平台/一体化/小手机一体化.json`，启用「小手机一体化（寒冬）」。JSON 内嵌当前编译结果，无须先推送仓库。
3. 刷新一次酒馆页面，清除旧脚本已注册的运行时。打开精确名称为「末世寒冬 - 星穹秩序」的角色卡。

也可新建一个脚本，复制 `dist/小手机平台/一体化/index.js` 全文。两种安装方式二选一。

这是当前寒冬版的一体化入口。MVU 变量框架、角色卡变量结构和正文界面属于角色卡基础设施，继续按角色卡原有方式安装。

更新后重新构建并导入 JSON；移除或禁用后刷新页面以清理现有运行时。历史记录与按角色保存的设置仍使用原有存储。

## 构建

```powershell
$env:TAVERN_BUILD_PREFIXES='src/小手机平台/一体化'
$env:TAVERN_SKIP_GENERATORS='1'
pnpm exec webpack --mode production
node scripts/package-phone-all-in-one.mjs
```

所有小手机源码静态合并为同一个 index.js。公共第三方库仍按仓库 webpack 约定使用宿主全局或 CDN，因此这不是离线包。

## 产物验证

```powershell
node --experimental-vm-modules scripts/test-phone-all-in-one.mjs
```

该检查执行实际构建文件的 ready 回调，验证单脚本导出内容、全部组件注册及依赖图。它不替代酒馆现场的聊天、生成和数据库操作验证。
