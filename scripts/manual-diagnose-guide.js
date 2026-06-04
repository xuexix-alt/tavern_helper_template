/**
 * Same-layer UI 诊断脚本（简化版）
 *
 * 由于 playwright 模块解析问题，这个脚本提供手动诊断步骤
 */

console.log(`
╔════════════════════════════════════════════════════════════════╗
║          Same-layer UI 诊断与验证指南                          ║
╚════════════════════════════════════════════════════════════════╝

📋 **手动操作步骤**

1️⃣  打开 SillyTavern
   - 访问: http://127.0.0.1:8000/
   - 等待页面完全加载

2️⃣  选择角色
   - 点击 "末世寒冬-星穹秩序" 角色
   - 打开第一个聊天记录

3️⃣  打开浏览器开发者工具
   - 按 F12 或 Ctrl+Shift+I
   - 切换到 Console 标签页

4️⃣  执行诊断脚本（复制粘贴到控制台）：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

const diagnosticScript = `
(function diagnoseSameLayerUI() {
  console.log('%c=== Same-layer UI 诊断开始 ===', 'color: #0f0; font-size: 16px; font-weight: bold');

  const result = {
    timestamp: new Date().toISOString(),

    // 1. 检查全局变量
    globals: {
      eventOn: typeof window.eventOn,
      eventEmit: typeof window.eventEmit,
      eventRemoveListener: typeof window.eventRemoveListener,
      imageGenerationBridge: typeof window.imageGenerationBridge,
      recordLifecycleTrace: typeof window.recordLifecycleTrace,
    },

    // 2. 检查 Stream-demo 元素
    streamDemoElements: {
      byDataAttr: document.querySelectorAll('[data-stream-demo]').length,
      byClass: document.querySelectorAll('[class*="stream-demo"]').length,
      byId: document.querySelectorAll('[id*="stream-demo"]').length,
    },

    // 3. 检查消息
    messages: {
      total: document.querySelectorAll('.mes').length,
      withStreamDemo: 0,
      withMinimal: 0,
    },

    // 4. 检查 Vue 应用
    vueApp: null,
  };

  // 检查消息内容
  document.querySelectorAll('.mes').forEach(mes => {
    const text = mes.textContent || '';
    if (text.includes('stream-demo')) {
      result.messages.withStreamDemo++;
      if (text.includes('stream-demo:minimal')) {
        result.messages.withMinimal++;
      }
    }
  });

  // 检查 Vue 实例
  const app = document.querySelector('#app');
  if (app && app.__vue_app__) {
    result.vueApp = 'Vue 3 app found';
  } else if (app && app.__vue__) {
    result.vueApp = 'Vue 2 instance found';
  }

  console.log('%c1. 全局变量检查', 'color: #ff0; font-size: 14px; font-weight: bold');
  Object.entries(result.globals).forEach(([key, value]) => {
    const icon = (value === 'function' || value === 'object') ? '✅' : '❌';
    const color = (value === 'function' || value === 'object') ? '#0f0' : '#f00';
    console.log(\`%c  \${icon} \${key}: \${value}\`, \`color: \${color}\`);
  });

  console.log('%c2. Stream-demo 元素', 'color: #ff0; font-size: 14px; font-weight: bold');
  const hasStreamDemoElements = Object.values(result.streamDemoElements).some(v => v > 0);
  if (hasStreamDemoElements) {
    Object.entries(result.streamDemoElements).forEach(([key, value]) => {
      if (value > 0) {
        console.log(\`%c  ✅ \${key}: \${value} 个\`, 'color: #0f0');
      }
    });
  } else {
    console.log('%c  ❌ 未找到 stream-demo 元素', 'color: #f00');
  }

  console.log('%c3. 消息分析', 'color: #ff0; font-size: 14px; font-weight: bold');
  console.log(\`  📝 总消息数: \${result.messages.total}\`);
  console.log(\`  📦 包含 stream-demo: \${result.messages.withStreamDemo}\`);
  console.log(\`  📦 包含 minimal: \${result.messages.withMinimal}\`);

  console.log('%c4. Vue 应用', 'color: #ff0; font-size: 14px; font-weight: bold');
  if (result.vueApp) {
    console.log(\`%c  ✅ \${result.vueApp}\`, 'color: #0f0');
  } else {
    console.log('%c  ❌ 未找到 Vue 应用', 'color: #f00');
  }

  console.log('%c═══════════════════════════════════', 'color: #0ff');
  console.log('%c📋 诊断结论', 'color: #0ff; font-size: 16px; font-weight: bold');
  console.log('%c═══════════════════════════════════', 'color: #0ff');

  if (result.globals.imageGenerationBridge === 'object' ||
      result.globals.imageGenerationBridge === 'function') {
    console.log('%c✅ imageGenerationBridge 已安装 - 修复成功！', 'color: #0f0; font-size: 14px; font-weight: bold');
    console.log('%c   事件监听正常运行，可以进行生图测试', 'color: #0f0');
  } else {
    console.log('%c❌ imageGenerationBridge 未安装', 'color: #f00; font-size: 14px; font-weight: bold');

    if (!hasStreamDemoElements && result.messages.withStreamDemo === 0) {
      console.log('%c   原因: Same-layer UI 完全未加载', 'color: #f90');
      console.log('%c   建议: 检查正则扩展是否启用', 'color: #f90');
    } else if (hasStreamDemoElements) {
      console.log('%c   原因: Same-layer UI 已加载，但 onMounted() 未执行', 'color: #f90');
      console.log('%c   建议: 检查 Vue 生命周期或查看错误日志', 'color: #f90');
    } else if (result.messages.withStreamDemo > 0) {
      console.log('%c   原因: 消息中有 stream-demo 标记，但未渲染为元素', 'color: #f90');
      console.log('%c   建议: 检查正则替换规则配置', 'color: #f90');
    }
  }

  console.log('%c═══════════════════════════════════', 'color: #0ff');

  // 返回结果供进一步使用
  window._diagnosisResult = result;
  return result;
})();
`;

console.log(diagnosticScript);

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5️⃣  观察结果

   ✅ **成功标志**：
      - imageGenerationBridge: object/function ✅
      - eventOn: function ✅
      - 显示 "修复成功" 消息

   ❌ **失败标志**：
      - imageGenerationBridge: undefined ❌
      - 未找到 stream-demo 元素 ❌
      - 显示具体原因和建议

6️⃣  如果成功，进行生图测试

   a. 在聊天中双击一条消息
   b. 选择 "图片生成"
   c. 观察控制台是否出现以下日志：

      ✨ [imageGenerationBridge] on_request
      ✨ [imageGenerationBridge] on_response_success
      ✨ [same-layer] syncTranscriptItemsFromHostData

7️⃣  保存结果

   诊断结果已保存到: window._diagnosisResult

   如需导出，执行：
   console.log(JSON.stringify(window._diagnosisResult, null, 2));

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 **结果截图指南**

请截取以下内容发给我：
1. 诊断脚本的完整输出
2. 如果进行了生图测试，也请截取生图时的控制台日志

╔════════════════════════════════════════════════════════════════╗
║  准备就绪！现在可以开始手动诊断了                              ║
╚════════════════════════════════════════════════════════════════╝
`);
