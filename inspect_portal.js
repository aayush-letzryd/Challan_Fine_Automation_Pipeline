const { chromium } = require('playwright');

async function testFullNavigation() {
  console.log('[TestNav] Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Navigating to Home...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    console.log('Navigating to Bengaluru Portal Home...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome/Index/Bengaluru', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    console.log('Navigating to ServiceList...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome/ServiceList', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('Clicking Traffic Police Violation Fine link...');
    await page.click('text="Collection of Traffic Police Violation Fine"');
    await page.waitForTimeout(4000);

    console.log('Result Page URL:', page.url());
    console.log('Result Page Title:', await page.title());

    // Print all inputs and buttons on this page
    const elements = await page.$$eval('input, button, select, a', els => els.map(e => ({
      tag: e.tagName,
      id: e.id,
      name: e.name,
      type: e.type,
      placeholder: e.placeholder,
      value: e.value,
      text: e.innerText ? e.innerText.trim().substring(0, 30) : ''
    })).filter(x => x.id || x.name || x.placeholder || x.tag === 'INPUT' || x.text.includes('OTP') || x.text.includes('Send')));

    console.log('=== FORM ELEMENTS ON RESULT PAGE ===');
    console.log(JSON.stringify(elements, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

testFullNavigation();
