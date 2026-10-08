# 寒冬小手机脚本打包说明

从角色卡 **2.0.0** 开始，发布卡只安装一个「小手机一体化（寒冬）」脚本，构建入口为
`src/小手机平台/一体化/index.ts`，CDN 产物为 `dist/小手机平台/一体化/index.js`。

一体化内含全部 10 个组件入口。角色卡仍须精确命名为
`末世寒冬 - 星穹秩序`；寒冬适配器负责 owner/session 和唯一手机外壳。不要同时启用旧总成、平台分散组件或单独的寒冬适配器。升级后刷新一次酒馆页面，清理旧运行时。

## 角色卡脚本清单

- zod mvu
- zod 定义
- 后台数据维护
- 自动更新角色卡
- 小手机一体化（寒冬）

打包器移除被一体化替代的旧小手机入口及旧总成，同时移除「脚本测试」「变量结构测试」两个本地调试槽。其他自定义脚本保留。

## 构建与自动更新卡打包

```powershell
$env:TAVERN_BUILD_PREFIXES='src/小手机平台/一体化'
$env:TAVERN_SKIP_GENERATORS='1'
pnpm exec webpack --mode production
node scripts/package-phone-all-in-one.mjs
node --experimental-vm-modules scripts/test-phone-all-in-one.mjs
node scripts/test-package-winter-phone-card.mjs
node scripts/package-winter-phone-card.mjs --input 'src/末世寒冬 - 星穹秩序.png' --worldbook 'src/寒冬末日.json' --write
```

`src/寒冬末日/自动更新角色卡版本.yaml`
是发布版本来源。打包器把版本同步写入 PNG 的 chara 与 ccv3 数据块，验证后原子替换文件；重复打包不会增加重复脚本。

自动更新脚本继续读取上述版本清单，并下载
`src/末世寒冬 - 星穹秩序.png`。发布时需同时上传版本清单、PNG 与一体化 dist 产物。本地构建和打包完成不代表远端已发布。

只想手动安装手机时，可导入 `dist/小手机平台/一体化/小手机一体化.json`；它内嵌编译结果，不依赖项目文件先推送到 CDN。
