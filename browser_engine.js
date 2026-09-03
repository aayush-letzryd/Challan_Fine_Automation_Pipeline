const { chromium } = require('playwright');
const { execSync } = require('child_process');
const config = require('./config');
const { getExistingSnapshot, fetchFreshOTP } = require('./otp_fetcher');
const { markProcessed, isProcessed } = require('./checkpoint');
const { appendRecordsToCsv } = require('./gsheet_sync');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns formatted Indian Standard Time (IST): DD-MM-YYYY HH:mm:ss
 */
function getFormattedTimestampIST(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);

  const options = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(d);
  const getPart = (type) => parts.find(p => p.type === type)?.value || '';
  return `${getPart('day')}-${getPart('month')}-${getPart('year')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
}

/**
 * Dismisses modal popups (e.g. #k1HelpDeskPopup) if present.
 */
async function dismissPopup(page) {
  try {
    await page.evaluate(() => {
      const popup = document.querySelector('#k1HelpDeskPopup');
      if (popup) popup.remove();
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) backdrop.remove();
    });
  } catch (e) {
    // ignore popup errors
  }
}

/**
 * Main Playwright Engine Class for Karnataka One Portal Automation
 */
class ChallanBrowserEngine {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Initializes browser instance.
   */
  async initBrowser() {
    const isHeadless = process.env.HEADLESS !== 'false';
    console.log(`[BrowserEngine] Launching Playwright Chromium Browser (Headless: ${isHeadless})...`);

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check'
    ];

    this.browser = await chromium.launch({
      headless: isHeadless,
      args: launchArgs
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.page = await this.context.newPage();
    console.log(`[BrowserEngine] Browser successfully launched and ready.`);
  }

  /**
   * Performs 100% Automated Mobile No + OTP login authentication via Google Sheet filtering.
   */
  async loginWithOTP() {
    console.log(`\n======================================================`);
    console.log(`[BrowserEngine] Initiating Portal Navigation...`);
    console.log(`======================================================\n`);

    // Step 1: Guest Traffic Fine Page
    console.log(`[Step 1/2] Loading Traffic Police Violation Fine page...`);
    await this.page.goto('https://www.karnatakaone.gov.in/Home/GuestTrafficFine?param=Q0d2Z2g3bVZ2OXB6b2pRRGlSNTIzdz09', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(2000);
    await dismissPopup(this.page);

    // Check if already on logged-in search page
    if (this.page.url().includes('PoliceCollectionOfFineLogin')) {
      const existingSearchBox = await this.page.$('#txtSearchNumber, input[id*="Search"], input[name*="Search"], input#SearchValue');
      if (existingSearchBox) {
        console.log(`[BrowserEngine] Already logged in! Reached Search Dashboard.`);
        return true;
      }
    }

    // Locate VISIBLE Mobile Number input
    console.log(`[BrowserEngine] Locating visible Mobile Number input field...`);
    const mobileInput = this.page.locator('input[placeholder*="Enter Mobile No"], input[placeholder*="Mobile"]:not([type="hidden"])').first();
    
    const mobileNo = config.MOBILE_NO || '7483731338';
    console.log(`[BrowserEngine] Filling Mobile Number: ${mobileNo}`);
    await mobileInput.fill(mobileNo);
    await delay(1000);

    let authSuccess = false;
    let attempt = 0;

    while (!authSuccess && attempt < 5) {
      attempt++;
      console.log(`\n[BrowserEngine] --- OTP Verification Attempt ${attempt}/5 ---`);

      // Snapshot existing Google Sheet SMS rows BEFORE clicking Send OTP
      console.log(`[BrowserEngine] Capturing initial Google Sheet snapshot...`);
      const initialSnapshot = await getExistingSnapshot();

      // Click "Send OTP" / "Resend OTP" button
      console.log(`[BrowserEngine] Triggering 'Send / Resend OTP' button...`);
      const sendOtpBtn = this.page.locator('#SendOTP, input[value*="OTP"], button:has-text("OTP")').first();
      await sendOtpBtn.click({ force: true }).catch(() => {});
      console.log(`[BrowserEngine] OTP Request sent to ${mobileNo}.`);

      await delay(2000);

      // AUTOMATED OTP RETRIEVAL FROM LIVE GOOGLE SHEET
      console.log(`[BrowserEngine] Polling live Google Sheet for NEW incoming OTP SMS (Sheet ID: ${config.OTP_SHEET_ID})...`);
      let otpCode = '';
      try {
        otpCode = await fetchFreshOTP(initialSnapshot, 60);
      } catch (otpErr) {
        console.warn(`[BrowserEngine Warning] Attempt ${attempt} sheet polling timed out (${otpErr.message}).`);
      }

      if (!otpCode) {
        console.warn(`[BrowserEngine Warning] No OTP code ready yet. Retrying next automated attempt...`);
        await delay(15000);
        continue;
      }

      console.log(`[BrowserEngine] Auto-filling OTP code: ${otpCode}`);
      const otpInput = this.page.locator('input[placeholder*="Enter OTP"], input[placeholder*="OTP"]:not([type="hidden"])').first();
      await otpInput.fill('');
      await delay(200);
      await otpInput.fill(otpCode.trim());
      await delay(1000);

      // Click "Validate OTP" button
      console.log(`[BrowserEngine] Clicking 'Validate OTP' button...`);
      const validateOtpBtn = this.page.locator('#ValidateOTP, input[value*="Validate OTP"], button:has-text("Validate OTP")').first();
      await validateOtpBtn.click({ force: true });

      await delay(4000);
      await dismissPopup(this.page);

      // Check if search input or radio button appears on screen
      const searchBox = await this.page.$('#txtSearchNumber, input#SearchValue, input[id*="Search"], input[name*="Search"]');
      const isSearchDashboardReady = Boolean(searchBox);

      if (isSearchDashboardReady) {
        console.log(`[BrowserEngine] SUCCESS! Logged into Search Dashboard.`);
        authSuccess = true;
      } else {
        const pageBodyText = await this.page.innerText('body');
        if (pageBodyText.includes('InCorrect OTP') || pageBodyText.includes('Incorrect OTP') || pageBodyText.includes('Invalid OTP')) {
          console.warn(`[BrowserEngine Warning] Portal indicated 'InCorrect OTP' for code ${otpCode}. Retrying...`);
        } else {
          console.warn(`[BrowserEngine Warning] Search dashboard not ready yet. Retrying login step...`);
        }
        await delay(3000);
      }
    }

    if (!authSuccess) {
      throw new Error(`Failed to authenticate with OTP on Karnataka One portal after ${attempt} attempts.`);
    }

    return true;
  }

  /**
   * Scrapes Challans for a single vehicle registration number with strict input#Name extraction.
   */
  async scrapeVehicleChallan(vehicleObj) {
    const regNo = vehicleObj.clean;
    console.log(`\n------------------------------------------------------`);
    console.log(`[BrowserEngine] Searching Challans for Vehicle: ${regNo} (${vehicleObj.original})`);
    console.log(`------------------------------------------------------`);

    try {
      await dismissPopup(this.page);

      // 1. Clear any old/lingering table elements from previous search
      await this.page.evaluate(() => {
        const oldTables = document.querySelectorAll('table');
        oldTables.forEach(t => t.remove());
      }).catch(() => {});

      // 2. Ensure 'Registration No' radio button is explicitly selected
      const regNoRadio = this.page.locator('input[type="radio"][value*="Registration"], #RegistrationNo, input[id*="Registration"], input[value*="Registration"]').first();
      if (await regNoRadio.isVisible().catch(() => false)) {
        const isChecked = await regNoRadio.isChecked().catch(() => false);
        if (!isChecked) {
          console.log(`[BrowserEngine] Selecting 'Registration No' radio button...`);
          await regNoRadio.click({ force: true }).catch(() => {});
          await delay(600);
        }
      }

      // 3. Locate Search Input box and fill vehicle number
      const searchInput = this.page.locator('#SearchValue, #txtSearchNumber, input[id*="Search"], input[name*="Search"]').first();
      await searchInput.fill('');
      await delay(200);
      await searchInput.fill(regNo);
      await delay(400);

      // 4. Click Search button
      console.log(`[BrowserEngine] Clicking 'Search' button for ${regNo}...`);
      const searchBtn = this.page.locator('#btnSearch, button:has-text("Search"), input[value="Search"]').first();
      await searchBtn.click({ force: true });

      // Wait for AJAX response
      await delay(3500);

      // 5. EXACT RC Holder Name Extractor (reads input#Name value)
      let rcHolderName = 'N/A';
      try {
        rcHolderName = await this.page.evaluate(() => {
          const nameInput = document.querySelector('input#Name, input[name="Name"], #Name');
          if (nameInput && nameInput.value) {
            const val = nameInput.value.trim();
            // Discard phone numbers or validation prompts
            if (val && !/^\d+$/.test(val) && !val.toLowerCase().includes('please enter') && val.length > 2) {
              return val;
            }
          }
          return 'N/A';
        });
      } catch (e) {
        rcHolderName = 'N/A';
      }

      console.log(`[BrowserEngine] Extracted RC Holder Name: '${rcHolderName}' for vehicle ${regNo}`);

      // Check if alert or "No Records Found" message appears
      const pageText = await this.page.innerText('body');
      const hasNoRecordsMsg = pageText.includes('No Records Found') || pageText.includes('No Violations Found') || pageText.includes('Invalid Registration');

      if (hasNoRecordsMsg) {
        console.log(`[BrowserEngine] Status: NO FINES / CLEAN for vehicle ${regNo}`);
        return [{
          vehicleRegNo: regNo,
          rcHolderName: rcHolderName,
          totalAmountPending: 0,
          noticeNo: 'N/A',
          noticeGenerationDate: 'N/A',
          violationDate: 'N/A',
          violationTime: 'N/A',
          pointName: 'N/A',
          offenceDescription: 'NO VIOLATIONS / CLEAN',
          fineAmount: 0,
          scrapedTimestamp: getFormattedTimestampIST(),
          status: 'NO_FINES'
        }];
      }

      // Extract Violation Table Rows
      const tableRows = await this.page.$$('table tbody tr');
      console.log(`[BrowserEngine] Found ${tableRows.length} table row(s) for vehicle ${regNo}.`);

      const tempRecords = [];
      let cumulativeFine = 0;

      for (const row of tableRows) {
        const cells = await row.$$('td');
        if (cells.length >= 8) {
          const cellTexts = [];
          for (const cell of cells) {
            const txt = await cell.innerText();
            cellTexts.push(txt.trim());
          }

          const noticeNo = cellTexts[1] || 'N/A';
          const rowRegNoRaw = cellTexts[2] || '';
          const rowRegNoClean = rowRegNoRaw.toUpperCase().replace(/[^A-Z0-9]/g, '');

          // STRICT STALE ROW VERIFICATION
          if (rowRegNoClean && rowRegNoClean !== regNo) {
            console.warn(`[BrowserEngine Warning] Stale table row detected (${rowRegNoClean} != ${regNo}). Ignoring stale row.`);
            continue;
          }

          const noticeGenDate = cellTexts[3] || 'N/A';
          const violationDate = cellTexts[4] || 'N/A';
          const violationTime = cellTexts[5] || 'N/A';
          const pointName = cellTexts[6] || 'N/A';
          const offenceDesc = cellTexts[7] || 'N/A';
          const fineAmtStr = cellTexts[8] ? cellTexts[8].replace(/[^0-9]/g, '') : '0';
          const fineAmt = parseInt(fineAmtStr, 10) || 0;
          cumulativeFine += fineAmt;

          tempRecords.push({
            noticeNo,
            noticeGenDate,
            violationDate,
            violationTime,
            pointName,
            offenceDesc,
            fineAmt
          });
        }
      }

      // If no valid matching rows exist for this car, mark as CLEAN / NO_FINES
      if (tempRecords.length === 0) {
        console.log(`[BrowserEngine] Status: NO FINES FOUND for vehicle ${regNo}`);
        return [{
          vehicleRegNo: regNo,
          rcHolderName: rcHolderName,
          totalAmountPending: 0,
          noticeNo: 'N/A',
          noticeGenerationDate: 'N/A',
          violationDate: 'N/A',
          violationTime: 'N/A',
          pointName: 'N/A',
          offenceDescription: 'NO FINES FOUND',
          fineAmount: 0,
          scrapedTimestamp: getFormattedTimestampIST(),
          status: 'NO_FINES'
        }];
      }

      const records = tempRecords.map(item => ({
        vehicleRegNo: regNo,
        rcHolderName: rcHolderName,
        totalAmountPending: cumulativeFine,
        noticeNo: item.noticeNo,
        noticeGenerationDate: item.noticeGenDate,
        violationDate: item.violationDate,
        violationTime: item.violationTime,
        pointName: item.pointName,
        offenceDescription: item.offenceDesc,
        fineAmount: item.fineAmt,
        scrapedTimestamp: getFormattedTimestampIST(),
        status: 'HAS_FINES'
      }));

      console.log(`[BrowserEngine] Extracted ${records.length} valid record(s) for vehicle ${regNo}. Total Pending Fine: ₹${records[0]?.totalAmountPending || 0}`);
      return records;

    } catch (err) {
      console.error(`[BrowserEngine Error] Scraping failed for vehicle ${regNo}: ${err.message}`);
      return [{
        vehicleRegNo: regNo,
        rcHolderName: 'ERROR',
        totalAmountPending: 0,
        noticeNo: 'ERROR',
        noticeGenerationDate: 'N/A',
        violationDate: 'N/A',
        violationTime: 'N/A',
        pointName: 'N/A',
        offenceDescription: `SCRAPE_ERROR: ${err.message}`,
        fineAmount: 0,
        scrapedTimestamp: getFormattedTimestampIST(),
        status: 'ERROR'
      }];
    }
  }

  /**
   * Resets portal search form or session.
   */
  async resetSearchSession() {
    console.log(`[BrowserEngine] Resetting Portal Search Form...`);
    try {
      const resetBtn = this.page.locator('button:has-text("Reset"), input[value="Reset"], #btnReset').first();
      if (await resetBtn.isVisible().catch(() => false)) {
        await resetBtn.click({ force: true });
        await delay(1500);
      }
    } catch (e) {
      console.warn(`[BrowserEngine] Reset button click warning: ${e.message}`);
    }
  }

  /**
   * Closes browser context.
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log(`[BrowserEngine] Browser closed.`);
    }
  }
}

module.exports = ChallanBrowserEngine;
