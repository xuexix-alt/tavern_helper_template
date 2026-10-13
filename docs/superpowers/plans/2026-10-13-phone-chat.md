# 微信聊天滚动与群成员显示

**Goal:** 打开会话、发送和收到新消息时显示底部；群标题显示人数，右上角打开当前成员页。

**Architecture:** 保留 PhoneShell 和现有 DOM 渲染。外壳在挂载完成后通知 APP，聊天页使用有限高度的独立消息滚动区。群成员读取 listContacts 的 added/inEdenGroup 状态并包含“我”，无需修改存储或生成链路。

**Tech Stack:** TypeScript、Shadow DOM、CSS Grid、node:test、Chrome DevTools。

## 约束

- 用户已确认上述交互，直接在当前工作区执行。
- 保留无关的 st-chatu8；更新相关构建产物与一体化 JSON，不提交或推送。
- 群成员只读；姓名通过 textContent 渲染；不把历史发言者当作当前成员。
- 仅新消息或重新打开会话强制贴底，普通重绘保留当前阅读位置。

## 执行清单

- [x] 在真实浏览器加载当前 PhoneShell、APP 与 CSS，用长消息复现滚动容器问题。
- [x] 在 src/小手机平台/__tests__/shellSource.test.js 增加挂载后贴底、新消息贴底、群成员过滤及返回测试，先确认失败。
- [x] 在 shell/phoneShell.ts 与 apps/phoneApps.ts 增加挂载回调、活动视图检查及最新消息检测；移除固定延时重试。
- [x] 在 shell/phoneShell.css 约束聊天页高度、固定头部与输入区；新增群成员网格样式。
- [x] 在 apps/phoneApps.ts 加群人数与成员页；读取实时通讯录入群状态。
- [x] 执行 node --test src/小手机平台/__tests__/shellSource.test.js，浏览器验证桌面/窄屏、连续消息、上翻后新消息、成员页及返回。
- [x] 更新 wiki/05-手机外壳与内置APP.md；运行相关 lint、定向构建并检查最终差异。

## 验证记录

- 修改前：45 条长消息使 history 高度/scrollHeight 均为 4947px，scrollTop 为 0，外层 scrollHeight 为 5076px，输入框超出手机。
- 修改后：history 高度 471px、scrollTop 4476px，外层高度与 scrollHeight 均为 601px；输入框在手机内。
- node:test 29/29 通过；新增测试先失败后通过。
- Chrome 实际源码验证：初次打开、上翻后接收、连续接收、窄容器缩放、发送、成员页接收后返回、切换私聊、关闭再打开、375px 视口均通过。
- ESLint 零错误，现有测试加载器有两项 dynamic-require 警告。
- 40/50/一体化 production 构建通过；一体化包有常规体积警告。单脚本 JSON、入口及依赖图验证通过。
- webpack clean 会清空输出目录；原有未跟踪 JSON 被清理后已用仓库打包脚本重新生成，与最新 index.js 一致。
- localhost:8000 连接被拒绝，未进行真实酒馆会话验证；浏览器使用实际 UI 源码与模拟消息服务。
