# 寒冬小手机脚本打包说明

角色卡精确名称必须是 `末世寒冬 - 星穹秩序`。小手机平台部分推荐用**总成**安装（一条脚本替代六份平台脚本）：

| 脚本 | 本地构建产物 |
| --- | --- |
| 小手机平台总成 | `dist/小手机平台/总成/index.js`（内含 00运行时管理器 -> 50通信与情报APP 全部必需模块） |
| 小手机-90寒冬适配器 | `dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js` |

线上加载方式（两条 import 即可，jsdelivr 自动更新）：

```ts
import 'https://testingcf.jsdelivr.net/gh/<user>/<repo>@<tag>/dist/小手机平台/总成/index.js';
import 'https://testingcf.jsdelivr.net/gh/<user>/<repo>@<tag>/dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js';
```

总成版本戳写入 `window.top.__TAVERN_PHONE_ASSEMBLY__`（`PLATFORM_ASSEMBLY_VERSION`，发布时与 git tag 对齐），重复安装/混版会双通道告警。总成与散装脚本同版本重复注册幂等，可平滑互迁。

<details>
<summary>散装安装方式（等价，七份独立脚本）</summary>

| 脚本 | 本地构建产物 |
| --- | --- |
| 00运行时管理器 | `dist/小手机平台/脚本/00运行时管理器/index.js` |
| 10平台服务 | `dist/小手机平台/脚本/10平台服务/index.js` |
| 20数据与同步 | `dist/小手机平台/脚本/20数据与同步/index.js` |
| 30AI与调度 | `dist/小手机平台/脚本/30AI与调度/index.js` |
| 40手机外壳 | `dist/小手机平台/脚本/40手机外壳/index.js` |
| 50通信与情报APP | `dist/小手机平台/脚本/50通信与情报APP/index.js` |
| 小手机-90寒冬适配器 | `dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js` |

七个脚本可以按任意顺序加载。各入口只注册模块；当 `phone.adapter` 根依赖图完整后，公共 runtime 会在微任务中幂等初始化一次。缺少依赖时保持 `WAITING`，不要通过角色卡脚本排序来掩盖漏包。

</details>

角色卡打包时必须把这七份 `index.js` 都作为独立脚本写入卡内，不能把适配器并入 same-layer-pre，也不能只打包第七份脚本。适配器只在精确卡名匹配时取得 owner；切换聊天只更换 session，切换到别卡会释放 Shell、事件监听与请求。

## 本地构建与 PNG 原子发布

先构建第七入口：

```powershell
$env:TAVERN_BUILD_PREFIXES='src/寒冬末日/脚本/小手机-90寒冬适配器'
$env:TAVERN_SKIP_GENERATORS='1'
pnpm exec webpack --mode development
```

生成角色卡 PNG 时，不要让打包器直接覆盖玩家正在使用的文件。先在 `tavern_sync.yaml` 的角色卡配置中把 `导出文件路径` 指向同目录临时名 `src/寒冬末日/.末世寒冬 - 星穹秩序.next`，并配置角色卡头像以生成 PNG；然后在仓库根目录运行：

```powershell
node tavern_sync.mjs bundle '末世寒冬 - 星穹秩序'
$next = (Resolve-Path -LiteralPath 'src/寒冬末日/.末世寒冬 - 星穹秩序.next.png').Path
$target = [System.IO.Path]::GetFullPath('src/寒冬末日/末世寒冬 - 星穹秩序.png')
[System.IO.File]::Move($next, $target, $true)
```

只有临时 PNG 完整生成后才执行同卷原子替换。当前仓库里的 `寒冬末日` 配置是世界书配置，不应冒充上述角色卡配置；角色卡配置、头像和 PNG 本体应由角色卡打包任务提供。

远端 CDN 发布是独立流程。完成本地 dist/PNG 构建不代表 CDN 已更新；CDN URL、版本固定与上传校验必须在远端发布任务中单独处理。
