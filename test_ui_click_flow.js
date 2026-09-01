const { chromium } = require('playwright');

async function testGuestLoginFlow() {
  console.log('[GuestFlow] Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('1. Opening Portal Home...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    console.log('2. Navigating to GuestLoginWithOutMob...');
    await page.goto('https://www.karnatakaone.gov.in/Home/GuestLoginWithOutMob', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('Current URL on GuestLoginWithOutMob:', page.url());

    // Remove popup overlay if present
    await page.evaluate(() => {
      const popup = document.querySelector('#k1HelpDeskPopup');
      if (popup) popup.remove();
    });

    console.log('3. Clicking Collection of Traffic Police Violation Fine link via text locator...');
    const fineLink = page.locator('text=Collection of Traffic Police Violation Fine').first();
    await fineLink.click({ force: true });
    await page.waitForTimeout(3500);

    console.log('=== SUCCESS! TARGET URL ===', page.url());
    console.log('=== TARGET TITLE ===', await page.title());

    const hasMobileInput = await page.$('input[name*="Mobile"], input[id*="Mobile"], input[placeholder*="Mobile"], input[type="text"]');
    console.log('Mobile input found?:', Boolean(hasMobileInput));

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
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

testGuestLoginFlow();
