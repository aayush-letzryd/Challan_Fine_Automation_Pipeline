const { chromium } = require('playwright');

async function testBengaluruServicesClick() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('1. Portal Home...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    console.log('2. GuestLoginWithOutMob...');
    await page.goto('https://www.karnatakaone.gov.in/Home/GuestLoginWithOutMob', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    console.log('3. Clicking Bengaluru in City Menu...');
    const blrBtn = page.locator('a:has-text("Bengaluru")').first();
    await blrBtn.click({ force: true });
    await page.waitForTimeout(2500);

    console.log('Current URL after Bengaluru click:', page.url());

    const pageText = await page.innerText('body');
    console.log('=== PAGE BODY SAMPLE ===');
    console.log(pageText.substring(0, 1000));

    console.log('4. Looking for Traffic Police Fine link...');
    const fineLink = page.locator('text=Collection of Traffic Police Violation Fine').first();
    if (await fineLink.isVisible().catch(() => false)) {
      console.log('FOUND TRAFFIC FINE LINK! Clicking...');
      await fineLink.click({ force: true });
      await page.waitForTimeout(3000);

      console.log('=== SUCCESS! OTP SCREEN REACHED ===');
      console.log('=== OTP SCREEN URL ===', page.url());
      console.log('=== OTP SCREEN TITLE ===', await page.title());

      const inputs = await page.$$eval('input, button', els => els.map(e => ({ id: e.id, name: e.name, type: e.type, placeholder: e.placeholder })));
      console.log('=== FORM INPUTS AT OTP SCREEN ===');
      console.log(JSON.stringify(inputs.filter(i => i.id || i.name || i.type === 'text'), null, 2));
    } else {
      console.log('Fine link not visible yet.');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

testBengaluruServicesClick();
