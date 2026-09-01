const { chromium } = require('playwright');

async function inspectServiceList() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Navigating to Home...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    console.log('Navigating to ServiceList...');
    await page.goto('https://www.karnatakaone.gov.in/PortalHome/ServiceList', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const pageText = await page.innerText('body');
    console.log('--- PAGE BODY TEXT SAMPLE ---');
    console.log(pageText.substring(0, 1000));

    const links = await page.$$eval('a, td, div', els => els.map(e => e.innerText ? e.innerText.trim() : '').filter(t => t.length > 3 && t.length < 80));
    console.log('--- ALL TEXT ELEMENTS FOUND ---');
    console.log(links.filter(t => t.toLowerCase().includes('traffic') || t.toLowerCase().includes('police') || t.toLowerCase().includes('fine') || t.toLowerCase().includes('collection')));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

inspectServiceList();
