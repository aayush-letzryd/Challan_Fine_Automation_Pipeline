const { chromium } = require('playwright');

async function inspectHomeIndex() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('1. Navigating to Home...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    console.log('2. Clicking QUICK PAY...');
    const quickPay = page.locator('a:has-text("Quick Pay"), a:has-text("QUICK PAY")').first();
    await quickPay.click({ force: true });
    await page.waitForTimeout(2000);

    console.log('3. URL after Quick Pay:', page.url());

    // Print all links/buttons on Home/Index
    const elements = await page.$$eval('a, td, div', els => els.map(e => ({
      tag: e.tagName,
      id: e.id || '',
      className: e.className || '',
      text: e.innerText ? e.innerText.trim() : '',
      href: e.href || ''
    })).filter(x => x.text.length > 2 && x.text.length < 50));

    console.log('=== ELEMENTS ON HOME INDEX ===');
    console.log(elements.filter(x => x.text.toLowerCase().includes('service') || x.text.toLowerCase().includes('traffic') || x.text.toLowerCase().includes('fine') || x.text.toLowerCase().includes('bengaluru')));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

inspectHomeIndex();
