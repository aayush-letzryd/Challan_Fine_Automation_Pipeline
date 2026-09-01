const { chromium } = require('playwright');

async function recordExactSelectors() {
  console.log('Launching headful browser to trace exact user click sequence...');
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  try {
    console.log('Step 1: Navigating to PortalHome...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('Step 2: Clicking QUICK PAY...');
    await page.click('a:has-text("QUICK PAY")');
    await page.waitForTimeout(2000);

    console.log('Step 3: URL after QUICK PAY:', page.url());

    console.log('Step 4: Looking for Services section...');
    // Click 'Services' or 'SERVICES'
    const servicesElement = page.locator('text=Services').first();
    if (await servicesElement.isVisible()) {
      await servicesElement.click();
      await page.waitForTimeout(2000);
    }

    console.log('Step 5: URL after Services click:', page.url());

    console.log('Step 6: Looking for Collection of Traffic Police Violation Fine...');
    const fineElement = page.locator('text=Collection of Traffic Police Violation Fine').first();
    if (await fineElement.isVisible()) {
      await fineElement.click();
      await page.waitForTimeout(3000);
    }

    console.log('Step 7: Final URL:', page.url());
    console.log('Step 8: Final Title:', await page.title());

    // Print all inputs on final page
    const inputs = await page.$$eval('input', els => els.map(e => ({ id: e.id, name: e.name, type: e.type, placeholder: e.placeholder })));
    console.log('=== INPUT SELECTORS ON FINAL PAGE ===');
    console.log(JSON.stringify(inputs, null, 2));

  } catch (err) {
    console.error('Error during recording:', err.message);
  } finally {
    await browser.close();
  }
}

recordExactSelectors();
