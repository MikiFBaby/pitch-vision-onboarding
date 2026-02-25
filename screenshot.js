const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });
  
  try {
    console.log('Loading page...');
    await page.goto('http://localhost:3000/login?mode=signup&email=test@pitchperfectsolutions.net&role=agent', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('Page loaded, waiting for animations...');
    await page.waitForTimeout(2000);
    
    const screenshotPath = path.join(process.cwd(), 'screenshot.png');
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true
    });
    console.log('Screenshot saved to:', screenshotPath);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
