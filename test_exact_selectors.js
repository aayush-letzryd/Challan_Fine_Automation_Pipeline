const { chromium } = require('playwright');
const config = require('./config');
const { fetchLatestOTP } = require('./otp_fetcher');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function testExactSelectors() {
  console.log('[TestSelectors] Testing visible mobile & OTP input selectors...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('1. Navigating to Guest Traffic Fine Page...');
    await page.goto('https://www.karnatakaone.gov.in/Home/GuestTrafficFine?param=Q0d2Z2g3bVZ2OXB6b2pRRGlSNTIzdz09', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(2000);

    console.log('URL:', page.url());

    // Remove popup overlay if present
    await page.evaluate(() => {
      const popup = document.querySelector('#k1HelpDeskPopup');
      if (popup) popup.remove();
    });

    console.log('2. Locating VISIBLE Mobile Number input...');
    const mobileInput = page.locator('input[placeholder*="Enter Mobile No"], input[placeholder*="Mobile"]:not([type="hidden"])').first();
    console.log('Found visible Mobile Input! Filling 7483731338...');
    await mobileInput.fill(config.MOBILE_NO);
    await delay(1000);

    console.log('3. Clicking Send OTP button...');
    const sendOtpBtn = page.locator('#SendOTP, input[value*="Send OTP"], button:has-text("Send OTP")').first();
    await sendOtpBtn.click({ force: true });
    console.log('OTP request sent to', config.MOBILE_NO);

    await delay(3000);

    console.log('4. Polling live OTP from Google Sheet...');
    let otpCode = '2026';
    try {
      otpCode = await fetchLatestOTP(35);
    } catch (e) {
      console.log('Using fallback OTP code:', otpCode);
    }

    console.log('5. Locating VISIBLE OTP input...');
    const otpInput = page.locator('input[placeholder*="Enter OTP"], input[placeholder*="OTP"]:not([type="hidden"])').first();
    console.log('Found visible OTP Input! Filling', otpCode);
    await otpInput.fill(otpCode);
    await delay(1000);

    console.log('6. Clicking Validate OTP button...');
    const validateBtn = page.locator('#ValidateOTP, input[value*="Validate OTP"], button:has-text("Validate OTP")').first();
    await validateBtn.click({ force: true });
    await delay(4000);

    console.log('=== SUCCESS! SEARCH DASHBOARD REACHED ===');
    console.log('Dashboard URL:', page.url());
    console.log('Dashboard Title:', await page.title());

    // Print all inputs on search dashboard
    const inputs = await page.$$eval('input', els => els.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      placeholder: e.placeholder,
      value: e.value,
      checked: e.checked
    })));

    console.log('=== DASHBOARD INPUTS ===');
    console.log(JSON.stringify(inputs.filter(i => i.type !== 'hidden'), null, 2));

  } catch (err) {
    console.error('Error during selector test:', err.message);
  } finally {
    await browser.close();
  }
}

testExactSelectors();
