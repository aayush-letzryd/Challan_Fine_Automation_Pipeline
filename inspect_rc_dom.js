const ChallanBrowserEngine = require('./browser_engine');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function inspectVehicle() {
  console.log('--- Inspecting RC Holder Name for KA51AM4820 ---');
  const engine = new ChallanBrowserEngine();

  try {
    await engine.initBrowser();
    await engine.loginWithOTP();

    // Select Registration No radio
    const regNoRadio = engine.page.locator('input[type="radio"][value*="Registration"], #RegistrationNo, input[id*="Registration"], input[value*="Registration"]').first();
    if (await regNoRadio.isVisible().catch(() => false)) {
      await regNoRadio.click({ force: true });
      await delay(500);
    }

    // Search KA51AM4820
    const searchInput = engine.page.locator('#txtSearchNumber, input[id*="Search"], input[name*="Search"], input[placeholder*="Search"]:not([type="hidden"])').first();
    await searchInput.fill('KA51AM4820');
    await delay(300);

    const searchBtn = engine.page.locator('#btnSearch, button:has-text("Search"), input[value="Search"]').first();
    await searchBtn.click({ force: true });
    await delay(4000);

    // Dump all text and labels
    const pageData = await engine.page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('div, span, label, p, td, b, strong, input'));
      const details = [];

      for (const el of elements) {
        const txt = (el.innerText || el.value || '').trim();
        if (txt && (txt.includes('SAMVREEDDHI') || txt.includes('RC Holder') || txt.includes('Holder') || txt.includes('Amount to be Paid') || txt.includes('KA51AM4820'))) {
          details.push({
            tag: el.tagName,
            id: el.id,
            className: el.className,
            text: txt
          });
        }
      }

      return {
        bodyTextSnippet: document.body.innerText.substring(0, 800),
        matchedElements: details
      };
    });

    console.log('=== PAGE BODY SNIPPET ===');
    console.log(pageData.bodyTextSnippet);

    console.log('=== MATCHED DOM ELEMENTS ===');
    console.log(JSON.stringify(pageData.matchedElements, null, 2));

    await engine.close();
  } catch (err) {
    console.error('Inspection error:', err.message);
    if (engine) await engine.close().catch(() => {});
  }
}

inspectVehicle();
