/**
 * Same-layer UI 诊断脚本
 *
 * 自动打开 SillyTavern，加载指定聊天，并诊断 same-layer UI 状态
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function diagnoseSameLayerUI() {
  console.log('🚀 启动 Same-layer UI 诊断...\n');

  const browser = await chromium.launch({
    headless: false, // 显示浏览器窗口
    slowMo: 500,     // 减慢操作以便观察
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  // 收集控制台日志
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(`${msg.type()}: ${text}`);

    // 高亮关键日志
    if (text.includes('[stream-demo]') ||
        text.includes('[imageGenerationBridge]') ||
        text.includes('[same-layer]')) {
      console.log(`✨ ${msg.type()}: ${text}`);
    }
  });

  // 收集错误
  const errors = [];
  page.on('pageerror', error => {
    errors.push(error.message);
    console.error(`❌ Page Error: ${error.message}`);
  });

  try {
    console.log('📂 正在打开 SillyTavern...');
    await page.goto('http://127.0.0.1:8000/', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('⏳ 等待页面加载...');
    await page.waitForTimeout(2000);

    console.log('🔍 查找角色 "末世寒冬-星穹秩序"...');

    // 尝试多种选择器查找角色
    const characterSelectors = [
      'text=末世寒冬',
      '[data-character*="末世寒冬"]',
      '.character_select:has-text("末世寒冬")',
      '.avatar[title*="末世寒冬"]',
    ];

    let characterFound = false;
    for (const selector of characterSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          console.log(`✅ 找到角色（使用选择器: ${selector}）`);
          await element.click();
          characterFound = true;
          break;
        }
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }

    if (!characterFound) {
      console.log('⚠️ 未找到角色，尝试手动定位...');
      console.log('📋 当前页面 URL:', page.url());

      // 截图当前状态
      await page.screenshot({ path: '.tmp/diagnosis-no-character.png' });
      console.log('📸 已保存截图: .tmp/diagnosis-no-character.png');
    }

    console.log('⏳ 等待聊天加载...');
    await page.waitForTimeout(3000);

    console.log('\n🔬 开始诊断 Same-layer UI...\n');

    // 执行诊断脚本
    const diagnosticResult = await page.evaluate(() => {
      const result = {
        timestamp: new Date().toISOString(),
        url: window.location.href,

        // 检查 Same-layer UI 元素
        streamDemoElements: [],

        // 检查全局变量
        globals: {
          eventOn: typeof window.eventOn,
          eventEmit: typeof window.eventEmit,
          eventRemoveListener: typeof window.eventRemoveListener,
          imageGenerationBridge: typeof window.imageGenerationBridge,
          recordLifecycleTrace: typeof window.recordLifecycleTrace,
        },

        // 检查消息内容
        messages: [],

        // 检查相关 DOM
        relevantElements: {
          mesText: document.querySelectorAll('.mes_text').length,
          streamDemoMarkers: [],
        },
      };

      // 查找 stream-demo 元素
      const streamDemoSelectors = [
        '[data-stream-demo]',
        '[class*="stream-demo"]',
        '[id*="stream-demo"]',
      ];

      streamDemoSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          result.streamDemoElements.push({
            selector,
            count: elements.length,
            visible: Array.from(elements).some(el => el.offsetParent !== null),
          });
        }
      });

      // 检查消息中的 stream-demo 标记
      document.querySelectorAll('.mes').forEach((mes, index) => {
        const text = mes.textContent || '';
        if (text.includes('stream-demo')) {
          result.relevantElements.streamDemoMarkers.push({
            index,
            mesId: mes.getAttribute('mesid'),
            hasMinimal: text.includes('stream-demo:minimal'),
            excerpt: text.substring(0, 200),
          });
        }
      });

      // 收集最近的消息
      const recentMessages = Array.from(document.querySelectorAll('.mes')).slice(-5);
      result.messages = recentMessages.map((mes, index) => ({
        index,
        mesId: mes.getAttribute('mesid'),
        isUser: mes.classList.contains('user'),
        textLength: (mes.textContent || '').length,
        hasStreamDemo: (mes.textContent || '').includes('stream-demo'),
      }));

      return result;
    });

    console.log('📊 诊断结果：\n');
    console.log('1. 页面信息:');
    console.log(`   URL: ${diagnosticResult.url}`);
    console.log(`   时间: ${diagnosticResult.timestamp}\n`);

    console.log('2. 全局变量:');
    Object.entries(diagnosticResult.globals).forEach(([key, value]) => {
      const icon = value === 'function' || value === 'object' ? '✅' : '❌';
      console.log(`   ${icon} ${key}: ${value}`);
    });
    console.log('');

    console.log('3. Stream-demo 元素:');
    if (diagnosticResult.streamDemoElements.length > 0) {
      diagnosticResult.streamDemoElements.forEach(el => {
        console.log(`   ✅ ${el.selector}: ${el.count} 个，可见: ${el.visible}`);
      });
    } else {
      console.log('   ❌ 未找到 stream-demo 元素');
    }
    console.log('');

    console.log('4. 消息中的 stream-demo 标记:');
    if (diagnosticResult.relevantElements.streamDemoMarkers.length > 0) {
      diagnosticResult.relevantElements.streamDemoMarkers.forEach(marker => {
        console.log(`   ✅ 消息 #${marker.index} (mesId=${marker.mesId})`);
        console.log(`      包含 minimal: ${marker.hasMinimal}`);
        console.log(`      摘录: ${marker.excerpt.substring(0, 100)}...`);
      });
    } else {
      console.log('   ❌ 未找到 stream-demo 标记');
    }
    console.log('');

    console.log('5. 最近消息:');
    diagnosticResult.messages.forEach(msg => {
      const type = msg.isUser ? 'User' : 'Assistant';
      const streamDemo = msg.hasStreamDemo ? '📦' : '　';
      console.log(`   ${streamDemo} #${msg.index} [${type}] mesId=${msg.mesId}, 长度=${msg.textLength}`);
    });
    console.log('');

    // 保存完整日志
    const reportPath = path.join(__dirname, '../.tmp/diagnosis-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
      diagnostic: diagnosticResult,
      logs: logs.slice(-100), // 最后 100 条日志
      errors,
    }, null, 2));

    console.log('💾 完整报告已保存: .tmp/diagnosis-report.json\n');

    // 等待用户观察
    console.log('⏸️  浏览器将保持打开 30 秒，请观察控制台...');
    await page.waitForTimeout(30000);

    // 结论
    console.log('\n📋 诊断结论:\n');

    if (diagnosticResult.globals.imageGenerationBridge === 'object' ||
        diagnosticResult.globals.imageGenerationBridge === 'function') {
      console.log('✅ imageGenerationBridge 已安装 - 修复成功！');
    } else {
      console.log('❌ imageGenerationBridge 未安装');

      if (diagnosticResult.streamDemoElements.length === 0) {
        console.log('   原因：Same-layer UI 未加载');
        console.log('   建议：检查正则扩展配置');
      } else {
        console.log('   原因：onMounted() 可能未执行');
        console.log('   建议：检查 Vue 生命周期');
      }
    }

  } catch (error) {
    console.error('\n❌ 诊断过程出错:', error.message);
    await page.screenshot({ path: '.tmp/diagnosis-error.png' });
    console.log('📸 错误截图已保存: .tmp/diagnosis-error.png');
  } finally {
    console.log('\n🔚 诊断完成，关闭浏览器...');
    await browser.close();
  }
}

// 运行诊断
diagnoseSameLayerUI().catch(console.error);
