const { chromium } = require('playwright');

async function testGuestTrafficFine() {
  console.log('[TestDirect] Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Step 1: Navigating to Home...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    console.log('Step 2: Clicking QUICK PAY...');
    const quickPay = page.locator('a:has-text("Quick Pay"), a:has-text("QUICK PAY")').first();
    await quickPay.click({ force: true });
    await page.waitForTimeout(1500);

    console.log('Step 3: Clicking Bengaluru link under Traffic Violation Details...');
    const btpLink = page.locator('a:has-text("Bengaluru")').first();
    if (await btpLink.isVisible()) {
      await btpLink.click({ force: true });
    } else {
      console.log('Navigating directly to GuestTrafficFine URL...');
      await page.goto('https://www.karnatakaone.gov.in/Home/GuestTrafficFine?param=Q0d2Z2g3bVZ2OXB6b2pRRGlSNTIzdz09', { waitUntil: 'domcontentloaded' });
    }
    await page.waitForTimeout(3000);

    console.log('=== TARGET PAGE REACHED ===');
    console.log('Target URL:', page.url());
    console.log('Target Title:', await page.title());

    const inputs = await page.$$eval('input, button', els => els.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      placeholder: e.placeholder,
      value: e.value,
      className: e.className
    })));

    console.log('=== ALL FORM INPUTS AT OTP SCREEN ===');
    console.log(JSON.stringify(inputs, null, 2));

  } catch (err) {
    console.error('Error during test:', err.message);
  } finally {
    await browser.close();
  }
}

testGuestTrafficFine();
