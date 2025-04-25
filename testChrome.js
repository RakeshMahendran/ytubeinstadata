const { Builder } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

(async () => {
  try {
    const options = new chrome.Options();
    options.setChromeBinaryPath("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"); // use correct path
    options.addArguments("--headless=new");
    options.addArguments("--disable-gpu");
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");
    options.addArguments("--disable-blink-features=AutomationControlled");

    const driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();

    await driver.get("https://www.google.com");
    const title = await driver.getTitle();
    await driver.quit();

    console.log("✅ Success! Page Title:", title);
  } catch (err) {
    console.error("❌ Standalone Test Failed:", err.message);
  }
})();
