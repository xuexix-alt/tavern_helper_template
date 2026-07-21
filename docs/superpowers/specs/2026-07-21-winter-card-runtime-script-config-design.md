# 末世寒冬角色卡运行脚本配置设计

**目标角色卡：** `末世寒冬 - 星穹秩序`  
**目标分支：** `20260211`

## 目标

将角色卡 PNG 内的正式 Zod 定义、伊甸后台数据辅助和自动更新脚本固定为 `20260211` CDN 地址并启用，同时关闭本地变量结构测试脚本。配置必须由原子 PNG 打包器可重现，不仅是一次性修改 PNG。

## 脚本终态

| 脚本 | 状态 | 内容 |
|---|---:|---|
| `zod mvu` | 开启 | 保持现有 MagVarUpdate import |
| `zod 定义` | 开启 | `import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/变量结构/index.js'` |
| `后台数据维护` | 开启 | `import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/伊甸后台数据辅助/index.js'` |
| `脚本测试` | 关闭 | 保留现有 localhost import，仅供本地开发 |
| `变量结构测试` | 关闭 | 保留现有 localhost import，仅供本地开发 |
| `自动更新角色卡` | 开启 | `import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/自动更新角色卡/index.js'` |

其他酒馆助手脚本的内容和启用状态不变，包括七个小手机脚本的 localhost 开发地址。

## 实现

1. 在 `scripts/package-winter-phone-card.mjs` 中增加角色卡基础运行脚本的稳定定义。
2. 对已有脚本按稳定 ID 就地更新，不创建同名重复项。
3. 为新增的自动更新脚本使用稳定 ID；再次打包必须字节幂等。
4. 原子更新 `src/末世寒冬 - 星穹秩序.png`，写入后重新解码验证。
5. 将 `src/寒冬末日/自动更新角色卡版本.yaml` 从 `1.0.0` 提升到 `1.0.2`，使旧卡能检测新 PNG。
6. 将上述六个基础脚本按表格顺序固定在角色脚本列表顶部。

## 验证

- 打包器测试先失败，再通过实现达到上述五项终态。
- 解码最终 PNG，校验脚本名称、稳定 ID、完整 import 文本和 `enabled`。
- 校验相同名称和 ID 不重复，七个小手机脚本仍然启用。
- 校验二次打包产物字节完全一致，失败时不覆盖原 PNG。

## 不在范围内

- 不修改 Zod Schema 结构、MVU 世界书规则或伊甸后台数据辅助业务逻辑。
- 不改变小手机的本地开发 URL。
- 不改变自动更新检查和导入流程。
