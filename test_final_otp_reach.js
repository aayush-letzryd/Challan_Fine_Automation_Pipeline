const { chromium } = require('playwright');

async function testClickDynamicTokenLink() {
  console.log('[TestDynamic] Testing link click navigation for dynamic ASP.NET token...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('1. Navigating to Home...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    console.log('2. Navigating to GuestTrafficFine...');
    await page.goto('https://www.karnatakaone.gov.in/Home/GuestTrafficFine?param=Q0d2Z2g3bVZ2OXB6b2pRRGlSNTIzdz09', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    console.log('3. Finding and clicking Bengaluru link...');
    const link = page.locator('a[href*="GuestTrafficFine"], text=Bengaluru').first();
    await link.click({ force: true });
    await page.waitForTimeout(4000);

    console.log('Current URL after dynamic click:', page.url());
    console.log('Page Title:', await page.title());

    const inputs = await page.$$eval('input, button', els => els.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      placeholder: e.placeholder,
      value: e.value,
      className: e.className
    })));

    console.log('=== FORM INPUTS AT DYNAMIC TOKEN PAGE ===');
    console.log(JSON.stringify(inputs.filter(i => i.id || i.name || i.type === 'text' || i.type === 'button'), null, 2));

  } catch (err) {
    console.error('Error during test:', err.message);
  } finally {
    await browser.close();
  }
}

testClickDynamicTokenLink();
