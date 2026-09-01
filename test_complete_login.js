const { chromium } = require('playwright');
const config = require('./config');
const { fetchLatestOTP } = require('./otp_fetcher');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function testCompleteLogin() {
  console.log('[TestLogin] Testing automated login flow with exact DOM IDs...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('1. Portal Home...');
    await page.goto(config.PORTAL_HOME_URL, { waitUntil: 'domcontentloaded' });
    await delay(1000);

    console.log('2. Guest Traffic Fine Page...');
    await page.goto('https://www.karnatakaone.gov.in/Home/GuestTrafficFine?param=Q0d2Z2g3bVZ2OXB6b2pRRGlSNTIzdz09', { waitUntil: 'domcontentloaded' });
    await delay(2000);

    console.log('URL:', page.url());

    // Remove popup overlay if present
    await page.evaluate(() => {
      const popup = document.querySelector('#k1HelpDeskPopup');
      if (popup) popup.remove();
    });

    console.log('3. Filling Mobile Number #MobileNo...');
    const mobileInput = await page.waitForSelector('#MobileNo', { timeout: 15000 });
    await mobileInput.fill(config.MOBILE_NO);
    await delay(1000);

    console.log('4. Clicking #SendOTP button...');
    await page.click('#SendOTP', { force: true });
    console.log('OTP request sent to', config.MOBILE_NO);

    await delay(3000);

    console.log('5. Polling live OTP from Google Sheet...');
    const otpCode = await fetchLatestOTP(40);
    console.log('Extracted OTP Code:', otpCode);

    console.log('6. Filling #OTP input...');
    const otpInput = await page.waitForSelector('#OTP', { timeout: 15000 });
    await otpInput.fill(otpCode);
    await delay(1000);

    console.log('7. Clicking #ValidateOTP button...');
    await page.click('#ValidateOTP', { force: true });
    await delay(4000);

    console.log('=== LOGGED IN SEARCH DASHBOARD REACHED ===');
    console.log('Dashboard URL:', page.url());
    console.log('Dashboard Title:', await page.title());

    // Print input selectors on search dashboard
    const inputs = await page.$$eval('input, button', els => els.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      placeholder: e.placeholder,
      value: e.value
    })));

    console.log('=== SEARCH DASHBOARD INPUTS ===');
    console.log(JSON.stringify(inputs, null, 2));

  } catch (err) {
    console.error('Error during test:', err.message);
  } finally {
    await browser.close();
  }
}

testCompleteLogin();
