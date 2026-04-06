const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  try {
    const resp = await page.goto('http://127.0.0.1:8000/', {waitUntil:'domcontentloaded', timeout:30000});
    console.log(JSON.stringify({ok:true, status: resp && resp.status(), title: await page.title(), len: await page.evaluate(()=>document.documentElement.outerHTML.length)}, null, 2));
  } catch (e) {
    console.error('ERR', e && e.message);
  } finally {
    await browser.close();
  }
})();
