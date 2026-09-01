const { chromium } = require('playwright');

async function testFullGuestFlow() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('1. Going to Home page...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    console.log('2. Going to Bengaluru Portal...');
    await page.goto('https://www.karnatakaone.gov.in/Info/Public/BangaloreOnePortal', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    console.log('Current URL:', page.url());

    console.log('3. Clicking Services link...');
    const servicesLink = page.locator('text=Services, text=SERVICES').first();
    if (await servicesLink.isVisible()) {
      await servicesLink.click();
      await page.waitForTimeout(1500);
    }

    console.log('4. Going to ServiceList...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome/ServiceList', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('5. Checking page links for Traffic Police Fine...');
    const links = await page.$$eval('a', els => els.map(e => ({ text: e.innerText.trim(), href: e.href })));
    const fineLinkObj = links.find(l => l.text.toLowerCase().includes('traffic') || l.text.toLowerCase().includes('fine'));

    if (fineLinkObj) {
      console.log('Found Traffic Fine Link Href:', fineLinkObj.href);
      await page.goto(fineLinkObj.href, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      console.log('FINAL URL AT OTP SCREEN:', page.url());
      console.log('FINAL PAGE TITLE:', await page.title());

      const inputs = await page.$$eval('input, button', els => els.map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        placeholder: e.placeholder,
        value: e.value
      })));

      console.log('=== SUCCESS! FORM INPUTS FOUND ON OTP PAGE ===');
      console.log(JSON.stringify(inputs.filter(i => i.id || i.name || i.type === 'text'), null, 2));
    } else {
      console.log('Traffic fine link not found on ServiceList page.');
    }

  } catch (err) {
    console.error('Flow error:', err.message);
  } finally {
    await browser.close();
  }
}

testFullGuestFlow();
