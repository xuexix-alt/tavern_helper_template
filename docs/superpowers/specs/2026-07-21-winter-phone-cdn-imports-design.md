# 寒冬小手机 CDN Import 设计

**目标角色卡：** `末世寒冬 - 星穹秩序`  
**唯一发布分支：** `20260211`

## 目标

将角色卡内七个寒冬小手机脚本从 localhost import 改为固定 `@20260211` 分支的 `testingcf.jsdelivr.net` CDN import，使角色卡脱离本机开发服务仍能加载完整小手机。

## 精确脚本映射

CDN 根地址必须是：

```text
https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist
```

| 角色卡脚本名 | CDN 相对路径 |
|---|---|
| `小手机-00运行时管理器` | `小手机平台/脚本/00运行时管理器/index.js` |
| `小手机-10平台服务` | `小手机平台/脚本/10平台服务/index.js` |
| `小手机-20数据与同步` | `小手机平台/脚本/20数据与同步/index.js` |
| `小手机-30AI与调度` | `小手机平台/脚本/30AI与调度/index.js` |
| `小手机-40手机外壳` | `小手机平台/脚本/40手机外壳/index.js` |
| `小手机-50通信与情报APP` | `小手机平台/脚本/50通信与情报APP/index.js` |
| `小手机-90寒冬适配器` | `寒冬末日/脚本/小手机-90寒冬适配器/index.js` |

每个脚本内容统一为：

```js
import
'<CDN 根地址>/<CDN 相对路径>'
```

## 实现与不变项

- 扩展 `PHONE_SCRIPT_DEFINITIONS`，让每个脚本定义显式持有完整 CDN import URL。
- PNG 打包器继续按现有稳定 ID 幂等 upsert，七个脚本保持开启。
- 不改变脚本名称、ID、模块顺序、业务逻辑和寒冬适配关系。
- 不修改 Zod、后台数据维护或自动更新脚本的 import。
- 自动更新版本提升到 `1.0.3`。

## 验证

- 测试先证明当前 localhost import 不符合要求。
- 打包后解码 PNG，确认七个脚本各自唯一、全部开启且 URL 精确包含 `@20260211`。
- 确认七个脚本中不存在 `localhost`或未限定分支的 `tavern_helper_template/dist` URL。
- 保留 PNG 原子写入、重复打包字节幂等和失败不覆盖保证。
