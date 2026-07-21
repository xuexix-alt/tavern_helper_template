# 寒冬小手机 Owner 校验修复设计

## 问题

same-layer pre 的 `phoneBridge.ts` 将目标角色名写成了双反斜杠 Unicode 字面量：

```ts
'\\u672b\\u4e16\\u5bd2\\u51ac - \\u661f\\u7a79\\u79e9\\u5e8f'
```

该值包含 51 个字符，并不等于运行时适配器提供的 `末世寒冬 - 星穹秩序`。因此 `ownerMatches()` 恒为 `false`，pre UI 虽能发现 `window.top.TavernPhone`，仍只能显示“手机·不可用”。现有测试复制了同一错误字面量，未能发现真实运行时不匹配。

## 修复

- 将 `EXPECTED_OWNER.characterName` 改为真实中文 `末世寒冬 - 星穹秩序`。
- 将 `phoneBridge.test.ts` 的假运行时 owner 改为同一真实中文值，让测试模拟适配器实际输出。
- 保留 `adapterId: winter-apocalypse` 与 `runtimeMajor: 1` 的严格校验，不做转义兼容，不删除角色卡隔离。
- 不修改小手机运行时、业务模块、pre UI 布局或交互。

## 验证与发布

- 先运行使用真实中文 owner 的测试，确认它在旧实现上得到 `unavailable`。
- 修改桥接常量后，确认匹配 owner 为 `available`，错误 adapter 仍为 `unavailable`。
- 增加源码契约断言：桥接文件必须包含真实中文角色名，不得包含 `\\u672b` 双反斜杠字面量。
- 运行寒冬小手机相关测试并重新构建 same-layer pre 状态栏产物。
- 推送到 `20260211` 后，校验发布产物包含真实中文 owner。
