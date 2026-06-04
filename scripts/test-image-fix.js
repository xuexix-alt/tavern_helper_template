const { chromium } = require('../node_modules/.pnpm/playwright@1.60.0-alpha-1775951570000/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    devtools: true
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  // 监听控制台日志
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push({ type: msg.type(), text });

    // 关键日志高亮
    if (text.includes('[image-dom-fix]') ||
        text.includes('[fullscreen-restore]') ||
        text.includes('[imageDomSync]')) {
      console.log(`[KEY LOG] ${msg.type()}: ${text}`);
    }
  });

  console.log('🚀 正在打开 SillyTavern...');
  await page.goto('http://127.0.0.1:8000');
  await page.waitForLoadState('networkidle');

  console.log('📝 查找"末世寒冬-星穹秩序"聊天...');
  await page.waitForTimeout(2000);

  // 查找并点击聊天
  const chatFound = await page.evaluate(() => {
    const chatBlocks = document.querySelectorAll('.select_chat_block_wrapper');
    for (const block of chatBlocks) {
      const text = block.textContent?.trim();
      if (text && text.includes('末世寒冬') && text.includes('星穹秩序') && text.includes('2026-05-27')) {
        const clickTarget = block.querySelector('.select_chat_block') || block;
        clickTarget.click();
        return true;
      }
    }
    return false;
  });

  if (!chatFound) {
    console.error('❌ 未找到目标聊天');
    await browser.close();
    return;
  }

  console.log('✅ 聊天已打开，等待加载...');
  await page.waitForTimeout(3000);

  // 检查消息13的状态
  console.log('\n🔍 检查消息13状态...');
  const msg13Status = await page.evaluate(() => {
    const msg13 = document.querySelector('.mes[mesid="13"]');
    if (!msg13) return { error: 'Message 13 not found' };

    const mesText = msg13.querySelector('.mes_text');
    const rawHTML = mesText?.innerHTML || '';

    return {
      hasImageMarker: rawHTML.includes('image###'),
      imageMarkerCount: (rawHTML.match(/image###/g) || []).length,
      pluginContainerCount: msg13.querySelectorAll('.st-chatu8-image-container').length,
      pluginButtonCount: msg13.querySelectorAll('.st-chatu8-image-button').length,
      imageCount: msg13.querySelectorAll('img').length
    };
  });

  console.log('消息13状态:', JSON.stringify(msg13Status, null, 2));

  // 等待我们的修复触发（2秒后）
  console.log('\n⏳ 等待主动修复触发（2秒）...');
  await page.waitForTimeout(2500);

  // 再次检查消息13
  console.log('\n🔍 修复后检查消息13状态...');
  const msg13AfterFix = await page.evaluate(() => {
    const msg13 = document.querySelector('.mes[mesid="13"]');
    if (!msg13) return { error: 'Message 13 not found' };

    return {
      pluginContainerCount: msg13.querySelectorAll('.st-chatu8-image-container').length,
      pluginButtonCount: msg13.querySelectorAll('.st-chatu8-image-button').length,
      imageCount: msg13.querySelectorAll('img').length
    };
  });

  console.log('修复后状态:', JSON.stringify(msg13AfterFix, null, 2));

  // 检查关键日志
  console.log('\n📋 检查关键日志...');
  const keyLogs = logs.filter(log =>
    log.text.includes('[image-dom-fix]') ||
    log.text.includes('[imageDomSync]') ||
    log.text.includes('[imageDomFix]') ||
    log.text.includes('MESSAGE_UPDATED')
  );

  console.log(`找到 ${keyLogs.length} 条关键日志:`);
  keyLogs.forEach(log => console.log(`  ${log.type}: ${log.text}`));

  // 检查同层UI iframe
  console.log('\n🖼️ 检查同层UI iframe...');
  const iframeStatus = await page.evaluate(() => {
    const iframe = document.querySelector('iframe[id^="TH-message"]');
    if (!iframe) return { error: 'Iframe not found' };

    try {
      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc) return { error: 'Cannot access iframe' };

      // 查找画廊按钮
      const allButtons = Array.from(iframeDoc.querySelectorAll('button'));
      const galleryBtn = allButtons.find(btn => btn.textContent?.includes('画廊'));

      return {
        hasIframe: true,
        buttonCount: allButtons.length,
        hasGalleryButton: !!galleryBtn
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log('同层UI状态:', JSON.stringify(iframeStatus, null, 2));

  // 测试画廊打开
  if (iframeStatus.hasGalleryButton) {
    console.log('\n🎨 打开画廊...');
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[id^="TH-message"]');
      const iframeDoc = iframe?.contentDocument;
      const allButtons = Array.from(iframeDoc.querySelectorAll('button'));
      const galleryBtn = allButtons.find(btn => btn.textContent?.includes('画廊'));
      galleryBtn?.click();
    });

    await page.waitForTimeout(1000);

    // 检查画廊图片
    const galleryStatus = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[id^="TH-message"]');
      const iframeDoc = iframe?.contentDocument;

      const galleryImages = iframeDoc.querySelectorAll('.generated-image-asset, [class*="gallery"] img');

      return {
        galleryImageCount: galleryImages.length,
        firstImageVisible: galleryImages[0]?.offsetWidth > 0
      };
    });

    console.log('画廊状态:', JSON.stringify(galleryStatus, null, 2));
  }

  // 测试全屏切换
  console.log('\n🖥️ 测试全屏切换...');
  await page.evaluate(() => {
    const iframe = document.querySelector('iframe[id^="TH-message"]');
    const iframeDoc = iframe?.contentDocument;
    const fullscreenBtn = Array.from(iframeDoc.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('全屏'));
    fullscreenBtn?.click();
  });

  await page.waitForTimeout(1000);
  console.log('✅ 进入全屏');

  // 退出全屏
  await page.evaluate(() => {
    const iframe = document.querySelector('iframe[id^="TH-message"]');
    const iframeDoc = iframe?.contentDocument;
    const fullscreenBtn = Array.from(iframeDoc.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('退出全屏'));
    fullscreenBtn?.click();
  });

  await page.waitForTimeout(1000);
  console.log('✅ 退出全屏');

  // 检查恢复日志
  const restoreLogs = logs.filter(log => log.text.includes('[fullscreen-restore]'));
  console.log(`\n📋 全屏恢复日志 (${restoreLogs.length} 条):`);
  restoreLogs.forEach(log => console.log(`  ${log.text}`));

  console.log('\n✅ 测试完成，浏览器保持打开以便检查');
  console.log('💡 按 Ctrl+C 关闭浏览器');

  // 保持浏览器打开
  await new Promise(() => {});

})();
