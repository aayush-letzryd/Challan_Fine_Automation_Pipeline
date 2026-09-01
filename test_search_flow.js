const { chromium } = require('playwright');
const config = require('./config');
const { fetchLatestOTP } = require('./otp_fetcher');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function testSearchFlow() {
  console.log('[TestSearch] Starting end-to-end vehicle search test...');
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage();

  try {
    console.log('1. Navigating to GuestTrafficFine page...');
    await page.goto('https://www.karnatakaone.gov.in/Home/GuestTrafficFine?param=Q0d2Z2g3bVZ2OXB6b2pRRGlSNTIzdz09', { waitUntil: 'domcontentloaded' });
    await delay(2000);

    // Remove popup overlay if present
    await page.evaluate(() => {
      const popup = document.querySelector('#k1HelpDeskPopup');
      if (popup) popup.remove();
    });

    console.log('2. Filling Mobile Number #MobileNo...');
    const mobileInput = await page.waitForSelector('#MobileNo', { timeout: 15000 });
    await mobileInput.fill(config.MOBILE_NO);
    await delay(1000);

    console.log('3. Clicking #SendOTP...');
    await page.click('#SendOTP', { force: true });
    await delay(3000);

    console.log('4. Polling OTP from Google Sheet...');
    let otpCode = '2026';
    try {
      otpCode = await fetchLatestOTP(30);
    } catch (e) {
      console.log('Using last OTP code fallback:', otpCode);
    }

    console.log('5. Filling #OTP input...');
    const otpInput = await page.waitForSelector('#OTP', { timeout: 15000 });
    await otpInput.fill(otpCode);
    await delay(1000);

    console.log('6. Clicking #ValidateOTP...');
    await page.click('#ValidateOTP', { force: true });
    await delay(4000);

    console.log('7. Current Page URL:', page.url());

    // Print all radio buttons and text inputs after OTP validation
    const inputs = await page.$$eval('input', els => els.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      placeholder: e.placeholder,
      value: e.value,
      checked: e.checked
    })));

    console.log('=== INPUTS AFTER OTP VALIDATION ===');
    console.log(JSON.stringify(inputs.filter(i => i.type === 'radio' || i.type === 'text' || i.type === 'submit' || i.type === 'button'), null, 2));

    // Look for Registration No radio button & Search number input
    console.log('8. Selecting Registration No radio button...');
    const regRadio = page.locator('input[type="radio"][value*="Registration"], input[value*="Registration"], input[id*="Registration"]').first();
    if (await regRadio.isVisible().catch(() => false)) {
      await regRadio.click({ force: true });
      await delay(1000);
    }

    console.log('9. Filling test vehicle KA05AP6039...');
    const searchInput = page.locator('input[id*="Search"], input[name*="Search"], input[placeholder*="Search"]').first();
    await searchInput.fill('KA05AP6039');
    await delay(1000);

    console.log('10. Clicking Search button...');
    const searchBtn = page.locator('button:has-text("Search"), input[value="Search"], #btnSearch').first();
    await searchBtn.click({ force: true });
    await delay(4000);

    console.log('=== SCRAPING RESULT PAGE TEXT ===');
    const pageText = await page.innerText('body');
    console.log(pageText.substring(0, 1500));

    // Extract table rows if present
    const tableRows = await page.$$eval('table tbody tr', rows => rows.map(r => Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim())));
    console.log('=== EXTRACTED TABLE ROWS ===');
    console.log(JSON.stringify(tableRows, null, 2));

  } catch (err) {
    console.error('Error during test:', err.message);
  } finally {
    await browser.close();
  }
}

testSearchFlow();
