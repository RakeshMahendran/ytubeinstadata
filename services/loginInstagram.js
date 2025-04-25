const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");

async function loginInstagram() {
  const options = new chrome.Options();
  options.setChromeBinaryPath("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"); // Adjust if different
  options.addArguments("--headless=new");
  options.addArguments("--disable-gpu");
  options.addArguments("--no-sandbox");
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--disable-blink-features=AutomationControlled");

  let driver;

  try {
    console.log("🔐 Starting Instagram login...");

    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();

    await driver.get("https://www.instagram.com/accounts/login/");
    await driver.wait(until.elementLocated(By.name("username")), 10000);

    await driver.findElement(By.name("username")).sendKeys("_rakesh_mahendran_");
    await driver.findElement(By.name("password")).sendKeys("r@kesh r@kesh99");

    await driver.findElement(By.xpath("//button[@type='submit']")).click();

    await driver.wait(until.urlContains("instagram.com"), 15000);
    await driver.sleep(3000);

    const currentUrl = await driver.getCurrentUrl();

    if (currentUrl.includes("challenge")) {
      return {
        success: false,
        message: "Login challenge triggered",
        currentUrl
      };
    }

    console.log("✅ Logged in. URL:", currentUrl);
    return {
      success: true,
      message: "Login successful",
      currentUrl
    };
  } catch (err) {
    console.error("❌ Login error:", err.message);
    return {
      success: false,
      message: "Login failed",
      error: err.message
    };
  } finally {
    if (driver) await driver.quit();
  }
}

module.exports = { loginInstagram };
