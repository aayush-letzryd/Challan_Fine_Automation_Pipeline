const { chromium } = require('playwright');

async function inspectForm() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('1. Portal Home...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    console.log('2. GuestTrafficFine...');
    await page.goto('https://www.karnatakaone.gov.in/Home/GuestTrafficFine?param=Q0d2Z2g3bVZ2OXB6b2pRRGlSNTIzdz09', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('URL:', page.url());

    // Print all forms and their action attributes
    const forms = await page.$$eval('form', els => els.map(f => ({
      id: f.id,
      name: f.name,
      action: f.action,
      method: f.method,
      inputs: Array.from(f.querySelectorAll('input')).map(i => ({ id: i.id, name: i.name, type: i.type, value: i.value }))
    })));

    console.log('=== FORMS FOUND ON GUEST TRAFFIC FINE PAGE ===');
    console.log(JSON.stringify(forms, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

inspectForm();
