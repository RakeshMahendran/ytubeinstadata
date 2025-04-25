// services/instaService.js

const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const cheerio = require("cheerio");
const dotenv = require("dotenv");
const { AzureOpenAI } = require("openai");
dotenv.config();

// Move credentials to environment variables
const IG_USERNAME = process.env.IG_USERNAME || "_rakesh_mahendran_";
const IG_PASSWORD = process.env.IG_PASSWORD || "r@kesh r@kesh99";
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || "https://ai-innovation7209ai181705899158.openai.azure.com/";
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || "67nWrZWs62N62AaZlq4LNBSmZEXRKjZatJZDCYR6i6YSgjbcbhRrJQQJ99BBACHYHv6XJ3w3AAAAACOG2rfF";

// Timeout settings
const TIMEOUT = {
  PAGE_LOAD: 20000,  // 20 seconds for page load
  ELEMENT_WAIT: 10000, // 10 seconds for element wait
  LOGIN: 15000,      // 15 seconds for login
};

// Debug mode for additional logging
const DEBUG = true;

// Configure OpenAI client
let client;
try {
  client = new AzureOpenAI({
    api_key: AZURE_OPENAI_API_KEY,
    azure_endpoint: AZURE_OPENAI_ENDPOINT,
    apiVersion: "2024-05-01-preview",
  });
  console.log("🤖 OpenAI client initialized");
} catch (error) {
  console.error("⚠️ OpenAI client initialization failed:", error.message);
}

// ===== Browser Pool Setup =====
const MAX_DRIVERS = 2;
const driverPool = [];
let sessionCookies = null; // Store cookies from successful login

async function createDriver() {
  console.log("🔧 Creating new Chrome instance...");
  try {
    const options = new chrome.Options();
    
    // Configure Chrome options for better stability
    options.addArguments(
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1920,1080",
      "--disable-blink-features=AutomationControlled"
    );
    
    // Add user agent to reduce detection chance
    options.addArguments("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    
    // Create and configure driver
    const driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();
    
    // Set page load timeout
    await driver.manage().setTimeouts({
      pageLoad: TIMEOUT.PAGE_LOAD,
      script: TIMEOUT.PAGE_LOAD,
    });
    
    // Test by loading a simple page
    await driver.get("https://www.google.com");
    const title = await driver.getTitle();
    console.log(`✅ Chrome launched successfully (page title: ${title})`);
    
    return driver;
  } catch (error) {
    console.error("❌ CRITICAL: Failed to create Chrome instance:", error);
    throw new Error(`Chrome launch failed: ${error.message}`);
  }
}

async function getDriver() {
  try {
    return driverPool.length > 0 ? driverPool.pop() : await createDriver();
  } catch (error) {
    console.error("❌ Failed to get driver:", error.message);
    throw error;
  }
}

async function releaseDriver(driver) {
  if (!driver) return;
  try {
    if (driverPool.length < MAX_DRIVERS) {
      driverPool.push(driver);
      console.log(`🔄 Driver returned to pool (size: ${driverPool.length}/${MAX_DRIVERS})`);
    } else {
      console.log("🧹 Driver pool full, quitting driver");
      await driver.quit();
    }
  } catch (error) {
    console.error("⚠️ Error releasing driver:", error.message);
    try {
      await driver.quit();
    } catch (e) {
      // Already closed or errored, ignore
    }
  }
}

async function cleanupDriverPool() {
  console.log(`🧹 Cleaning up driver pool (${driverPool.length} instances)`);
  const quitPromises = driverPool.map(async driver => {
    try {
      await driver.quit();
      return true;
    } catch (error) {
      console.error("⚠️ Error quitting driver:", error.message);
      return false;
    }
  });
  await Promise.allSettled(quitPromises);
  driverPool.length = 0;
  console.log("✅ Driver pool cleaned up");
}

// ===== Session Management =====
async function saveSessionCookies(driver) {
  console.log("💾 Saving session cookies...");
  try {
    sessionCookies = await driver.manage().getCookies();
    console.log(`✅ Saved ${sessionCookies.length} cookies`);
    return true;
  } catch (error) {
    console.error("❌ Failed to save cookies:", error.message);
    return false;
  }
}

async function loadSessionCookies(driver) {
  if (!sessionCookies || sessionCookies.length === 0) {
    console.log("⚠️ No session cookies available to load");
    return false;
  }
  
  console.log(`🔄 Loading ${sessionCookies.length} saved cookies...`);
  try {
    // First navigate to Instagram domain to set cookies
    await driver.get("https://www.instagram.com/");
    
    // Add delay to ensure page loads enough to accept cookies
    await driver.sleep(1000);
    
    // Add cookies one by one
    for (const cookie of sessionCookies) {
      try {
        await driver.manage().addCookie(cookie);
      } catch (cookieError) {
        console.warn(`⚠️ Couldn't add cookie ${cookie.name}:`, cookieError.message);
      }
    }
    
    console.log("✅ Session cookies loaded successfully");
    
    // Refresh the page to activate cookies
    await driver.navigate().refresh();
    await driver.sleep(2000);
    
    // Verify login state
    const currentUrl = await driver.getCurrentUrl();
    const isLoggedIn = !currentUrl.includes("/accounts/login");
    console.log(`🔐 Login status after loading cookies: ${isLoggedIn ? "Logged in" : "Not logged in"}`);
    
    return isLoggedIn;
  } catch (error) {
    console.error("❌ Failed to load session cookies:", error.message);
    return false;
  }
}

// ===== Instagram Automation =====
async function loginInstagram(driver, forceLogin = false) {
  console.log("🔑 Starting Instagram login process...");
  
  // Try to use saved cookies first (unless forced login)
  if (!forceLogin && sessionCookies) {
    console.log("  → Attempting to use saved session...");
    const cookieLoginSuccessful = await loadSessionCookies(driver);
    if (cookieLoginSuccessful) {
      console.log("✅ Login successful using saved cookies");
      return true;
    }
    console.log("  → Cookie login failed, falling back to credential login");
  }
  
  // Perform regular login if needed
  console.log("  → Using credentials for login");
  try {
    console.log("  → Loading login page");
    await driver.get("https://www.instagram.com/accounts/login/");
    
    // Add a delay to ensure the page loads properly
    await driver.sleep(3000);
    
    // Wait for login form with detailed error handling
    try {
      console.log("  → Waiting for username field");
      await driver.wait(until.elementLocated(By.name("username")), TIMEOUT.ELEMENT_WAIT);
    } catch (error) {
      console.error("❌ Username field not found. Current URL:", await driver.getCurrentUrl());
      const source = await driver.getPageSource();
      console.log("Page source preview:", source.substring(0, 500) + "...");
      throw new Error("Login form not found");
    }
    
    console.log("  → Entering credentials");
    await driver.findElement(By.name("username")).sendKeys(IG_USERNAME);
    await driver.findElement(By.name("password")).sendKeys(IG_PASSWORD);
    
    console.log("  → Submitting login form");
    await driver.findElement(By.css("button[type='submit']")).click();
    
    // Wait for login completion with adequate delay
    console.log("  → Waiting for login to complete");
    await driver.sleep(7000); // Increased from 5000 to ensure page fully loads
    
    // Check for login success
    const currentUrl = await driver.getCurrentUrl();
    console.log(`  → Current URL after login: ${currentUrl}`);
    
    if (currentUrl.includes("instagram.com/accounts/login")) {
      // Still on login page, check for errors
      const errorElements = await driver.findElements(By.css("p[role='alert'], div.error-container"));
      if (errorElements.length > 0) {
        const errorText = await errorElements[0].getText();
        throw new Error(`Login failed: ${errorText}`);
      }
      throw new Error("Login form still present after submission");
    }
    
    // Save cookies on successful login
    await saveSessionCookies(driver);
    console.log("✅ Login successful");
    return true;
  } catch (error) {
    console.error(`❌ Instagram login failed: ${error.message}`);
    // Capture screenshot for debugging
    try {
      const screenshot = await driver.takeScreenshot();
      const base64Image = Buffer.from(screenshot, 'base64');
      const fs = require('fs');
      fs.writeFileSync('login_error.png', base64Image);
      console.log("📷 Error screenshot saved to login_error.png");
    } catch (ssError) {
      console.error("Failed to capture error screenshot:", ssError.message);
    }
    throw error;
  }
}

async function getFollowerCount(driver, handle) {
  console.log(`📊 Getting follower count for @${handle}...`);
  try {
    // Navigate to profile
    await driver.get(`https://www.instagram.com/${handle}/`);
    console.log(`  → Loading profile page for @${handle}`);
    
    // Add delay to ensure page loads properly
    await driver.sleep(3000);
    
    // Wait for profile to load
    await driver.wait(until.elementLocated(By.css("header")), TIMEOUT.PAGE_LOAD);
    console.log("  → Profile page loaded");
    
    // Get page source
    const html = await driver.getPageSource();
    const $ = cheerio.load(html);
    
    // Try multiple approaches to find follower count
    let followerCount = "Not found";
    
    // Approach 1: Look for elements with numbers in header section
    console.log("  → Searching for followers in header section");
    const headerSections = $("header section");
    headerSections.find("li").each((_, el) => {
      const text = $(el).text();
      if (text.toLowerCase().includes("follower")) {
        const match = text.match(/(\d+(?:[,.]\d+)?[KkMmBb]?)/);
        if (match) followerCount = match[1];
      }
    });
    
    // Approach 2: General span search if approach 1 fails
    if (followerCount === "Not found") {
      console.log("  → Trying general span search for follower count");
      $("span").each((_, el) => {
        const text = $(el).text();
        if (text.toLowerCase().includes("follower")) {
          const match = text.match(/(\d+(?:[,.]\d+)?[KkMmBb]?)/);
          if (match) followerCount = match[1];
        }
      });
    }
    
    console.log(`✅ Follower count: ${followerCount}`);
    return followerCount;
  } catch (error) {
    console.error(`❌ Error getting follower count: ${error.message}`);
    return "Error";
  }
}

async function fetchReelUrls(driver, handle, maxCount = 15) {
  console.log(`📺 Fetching up to ${maxCount} reels for @${handle}...`);
  try {
    // Navigate to reels page
    await driver.get(`https://www.instagram.com/${handle}/reels/`);
    console.log("  → Loaded reels page");
    
    // Add delay to ensure page loads properly
    await driver.sleep(3000);
    
    // Wait for content to load
    try {
      await driver.wait(until.elementLocated(By.css("a[href*='/reel/']")), TIMEOUT.PAGE_LOAD);
    } catch (error) {
      console.log("⚠️ No reels found immediately, will try scrolling");
    }
    
    const seen = new Set();
    let urls = [];
    let lastUrlCount = 0;
    let noNewContentCounter = 0;
    
    // Scroll and collect reels
    for (let scrollAttempt = 0; scrollAttempt < 10 && urls.length < maxCount; scrollAttempt++) {
      console.log(`  → Scroll attempt ${scrollAttempt + 1}, found ${urls.length}/${maxCount} reels`);
      
      // Process current view
      const html = await driver.getPageSource();
      const $ = cheerio.load(html);
      
      $("a[href*='/reel/']").each((_, el) => {
        const href = $(el).attr("href");
        if (href && href.includes("/reel/") && !seen.has(href)) {
          seen.add(href);
          urls.push("https://www.instagram.com" + href);
        }
      });
      
      // Check if we found new content
      if (urls.length === lastUrlCount) {
        noNewContentCounter++;
        if (noNewContentCounter >= 3) {
          console.log("  → No new content after 3 scrolls, stopping");
          break;
        }
      } else {
        noNewContentCounter = 0;
        lastUrlCount = urls.length;
      }
      
      // Scroll down
      await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
      await driver.sleep(2000);
    }
    
    console.log(`✅ Fetched ${urls.length} unique reels`);
    return urls.slice(0, maxCount);
  } catch (error) {
    console.error(`❌ Error fetching reel URLs: ${error.message}`);
    return [];
  }
}

// ===== View Count Extraction =====
async function extractViewCountWithGPT(html) {
  if (!client) {
    console.error("❌ OpenAI client not initialized");
    return "LLM Error";
  }
  
  console.log("🤖 Extracting view count using GPT...");
  try {
    // Use regex first for efficiency
    const viewRegex = /(\d+(?:[,.]\d+)?[KkMmBb]?)\s*views?/i;
    const match = html.match(viewRegex);
    
    if (match && match[1]) {
      console.log(`  → Found view count via regex: ${match[1]}`);
      return match[1];
    }
    
    // Truncate HTML to avoid token limits
    const truncatedHtml = html.slice(0, 10000);
    
    const prompt = `
    You are an expert at extracting view counts from Instagram reel HTML.
    Extract ONLY the numeric view count from this HTML snippet.
    Return ONLY the number with its suffix (K, M, B) if present.
    If you cannot find a view count, return exactly "Not found".
    
    HTML snippet:
    ${truncatedHtml}
    `;
    
    console.log("  → Sending request to GPT");
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 20,
    });
    
    const result = response.choices[0].message.content.trim();
    console.log(`  → GPT returned: "${result}"`);
    return result;
  } catch (error) {
    console.error(`❌ GPT extraction error: ${error.message}`);
    return "LLM Error";
  }
}

function parseViewCount(text) {
  if (!text || typeof text !== 'string' || text === "Not found" || text === "LLM Error" || text === "Error") {
    return null;
  }
  
  try {
    const clean = text.toLowerCase().replace(/,/g, "").trim();
    
    if (clean.endsWith("k")) {
      return Math.round(parseFloat(clean) * 1_000);
    }
    
    if (clean.endsWith("m")) {
      return Math.round(parseFloat(clean) * 1_000_000);
    }
    
    if (clean.endsWith("b")) {
      return Math.round(parseFloat(clean) * 1_000_000_000);
    }
    
    const parsed = parseInt(clean);
    return isNaN(parsed) ? null : parsed;
  } catch (err) {
    console.error(`❌ Parse error for "${text}":`, err.message);
    return null;
  }
}

async function fetchReelViewCount(driver, url, retryCount = 1) {
  console.log(`👁️ Fetching view count for ${url}`);
  try {
    // Load the reel
    await driver.get(url);
    console.log("  → Reel page loaded");
    
    // Wait for content to load with increased delay
    await driver.sleep(4000);
    
    // Parse the page
    const html = await driver.getPageSource();
    const $ = cheerio.load(html);
    
    // Method 1: Direct span search
    console.log("  → Searching for view count in spans");
    let viewText = null;
    
    $("span").each((_, el) => {
      const text = $(el).text().trim();
      if (/\d+(?:[.,]\d+)?[KMB]?\s*views?/i.test(text)) {
        const match = text.match(/(\d+(?:[.,]\d+)?[KMB]?)/i);
        if (match) viewText = match[1];
      }
    });
    
    // Method 2: Use GPT if direct search fails
    if (!viewText) {
      console.log("  → Direct search failed, using GPT extraction");
      viewText = await extractViewCountWithGPT(html);
    }
    
    console.log(`  → View count: ${viewText}`);
    return {
      url,
      views: viewText,
      parsed: parseViewCount(viewText),
    };
  } catch (error) {
    console.error(`❌ Error fetching view count: ${error.message}`);
    
    // Retry once if failed
    if (retryCount > 0) {
      console.log(`  → Retrying (${retryCount} attempt left)`);
      await driver.sleep(2000); // Wait before retry
      return fetchReelViewCount(driver, url, retryCount - 1);
    }
    
    return { url, views: "Error", parsed: null };
  }
}

async function processReelsBatch(urls, batchSize = 2) {
  console.log(`⚙️ Processing ${urls.length} reels in batches of ${batchSize}...`);
  const results = [];
  
  // Process in batches to avoid overwhelming resources
  for (let i = 0; i < urls.length; i += batchSize) {
    console.log(`  → Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(urls.length/batchSize)}`);
    const batch = urls.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async url => {
      const driver = await getDriver();
      try {
        // Use existing session instead of logging in again
        const cookieLoginSuccessful = await loadSessionCookies(driver);
        
        // Only attempt credential login if cookie login failed
        if (!cookieLoginSuccessful) {
          console.log("  → Cookie login failed for batch processing, attempting credential login");
          await loginInstagram(driver);
        }
        
        return await fetchReelViewCount(driver, url);
      } catch (error) {
        console.error(`❌ Batch processing error for ${url}:`, error.message);
        return { url, views: "Error", parsed: null };
      } finally {
        await releaseDriver(driver);
      }
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error(`❌ Promise rejected for ${batch[index]}:`, result.reason);
        results.push({ url: batch[index], views: "Error", parsed: null });
      }
    });
    
    // Wait between batches to avoid rate limiting
    if (i + batchSize < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Increased from 2000 to 3000
    }
  }
  
  // Calculate average
  const valid = results.filter(r => r.parsed !== null).map(r => r.parsed);
  const avg = valid.length ? Math.floor(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
  
  console.log(`✅ Processing complete. Average views: ${avg} from ${valid.length}/${results.length} valid results`);
  return { results, avg };
}

// ===== Entry Point =====
async function analyzeInstagramUser(handle) {
  console.log(`\n🚀 Starting analysis for Instagram user @${handle}...`);
  let mainDriver;
  
  try {
    // Create initial driver
    mainDriver = await createDriver();
    
    // Login to Instagram (force a fresh login for first run)
    await loginInstagram(mainDriver, true);
    
    // Get follower count
    const followers = await getFollowerCount(mainDriver, handle);
    
    // Get reel URLs
    const urls = await fetchReelUrls(mainDriver, handle);
    
    if (urls.length === 0) {
      console.warn("⚠️ No reels found for this user");
    }
    
    // Release main driver before batch processing
    await releaseDriver(mainDriver);
    mainDriver = null;
    
    // Process reels in batches
    const { avg } = await processReelsBatch(urls);
    
    console.log(`\n✅ Analysis complete for @${handle}`);
    return {
      instagram_handle: handle,
      followers_count: followers,
      average_views_last_15_reels: avg,
      average_views_last_7_branded_reels: 0, // Optional feature
    };
  } catch (error) {
    console.error(`\n❌ Analysis failed for @${handle}:`, error.message);
    return {
      instagram_handle: handle,
      followers_count: "Error",
      average_views_last_15_reels: "Error",
      average_views_last_7_branded_reels: "Error",
    };
  } finally {
    // Ensure we clean up properly
    if (mainDriver) {
      try {
        await mainDriver.quit();
      } catch (e) {
        console.error("⚠️ Error quitting main driver:", e.message);
      }
    }
    await cleanupDriverPool();
  }
}



module.exports = {
  analyzeInstagramUser
};