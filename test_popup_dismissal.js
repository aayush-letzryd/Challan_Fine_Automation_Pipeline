const { chromium } = require('playwright');

async function dismissPopup(page) {
  try {
    const closeBtn = page.locator('#k1HelpDeskPopup .close, #k1HelpDeskPopup button, .modal .close, text="×", .k1-popup-close').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      console.log('  [Popup] Closing modal popup...');
      await closeBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  } catch (e) {
    // ignore
  }
}

async function testFullNavigation() {
  console.log('[TestNav] Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('1. Navigating to Home page...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await dismissPopup(page);

    console.log('2. Clicking QUICK PAY...');
    const quickPay = page.locator('a:has-text("Quick Pay"), a:has-text("QUICK PAY")').first();
    await quickPay.click({ force: true });
    await page.waitForTimeout(2000);
    await dismissPopup(page);

    console.log('3. URL after Quick Pay:', page.url());

    console.log('4. Navigating to ServiceList page...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome/ServiceList', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await dismissPopup(page);

    console.log('5. URL on ServiceList:', page.url());

    console.log('6. Clicking Collection of Traffic Police Violation Fine via text locator...');
    const fineLink = page.locator('text=Collection of Traffic Police Violation Fine').first();
    await fineLink.click({ force: true });
    await page.waitForTimeout(3000);

    console.log('=== SUCCESS! REACHED TARGET OTP PAGE ===');
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

    console.log('=== FORM INPUTS AT TARGET PAGE ===');
    console.log(JSON.stringify(inputs.filter(i => i.id || i.name || i.type === 'text'), null, 2));

  } catch (err) {
    console.error('Error during test:', err.message);
  } finally {
    await browser.close();
  }
}

testFullNavigation();
