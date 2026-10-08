# 角色卡自动更新

通过 `@types/function/import_raw.d.ts` 定义的 `importRawCharacter` 导入角色卡；随后用 `getCharacter` 回读核验。

- 自动检查只在远端版本较新时更新。
- 手动点击「角色卡更新-执行」允许同版本重新导入，用于修复 2.0.0 缺少小手机脚本的情况；不会降级。重新导入会使用发布卡内容覆盖角色卡设置，手动定制过的卡请先导出备份。
- PNG 请求附带版本参数，但不假设该参数能清除 CDN 缓存；导入响应成功、实际卡版本匹配、2.0.0 及以上包含已启用的一体化 CDN 脚本时，才记录更新成功。
- 如果核验失败，不记录成功版本；已经发生的导入不会自动回滚。
- 完成更新后刷新整个酒馆页面，清理旧小手机运行时。不要同时启用旧散装手机脚本和一体化脚本。

验证与构建：

```powershell
node scripts/test-auto-update-character.mjs
$env:TAVERN_BUILD_PREFIXES='src/寒冬末日/脚本/自动更新角色卡'
$env:TAVERN_SKIP_GENERATORS='1'
pnpm exec webpack --mode production
```

发布时需要上传 `dist/寒冬末日/脚本/自动更新角色卡/index.js`。本地构建不会自动更新 CDN 或玩家酒馆；已打开的旧脚本需在发布并刷新后才能使用修复逻辑。
