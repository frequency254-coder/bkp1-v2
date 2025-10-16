const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const slugify = require("slugify");
const dotenv = require("dotenv");
const net = require("net");
const TorControl = require("tor-control");

dotenv.config();

const Category = require("./Models/categoryModel.js");
const Product = require("./Models/productsModel.js");
const PLATFORMS = require("./platforms.js");
const TECH_SECURITY_GAMING_CATEGORIES = require("./categories.js");

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile Safari/604.1",
];
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ===================== Helpers =====================
const MONGO_URI = process.env.CONN_STR;
const MIN_DELAY = parseInt(process.env.MIN_DELAY || "1500", 10);
const MAX_DELAY = parseInt(process.env.MAX_DELAY || "4000", 10);
const MAX_PAGES = parseInt(process.env.MAX_PAGES || "3", 10);

function randDelay() {
    return Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
// Cross-version wait wrapper
async function wait(page, ms) {
    if (typeof page.waitForTimeout === "function") {
        return page.waitForTimeout(ms);
    } else if (typeof page.waitFor === "function") {
        return page.waitFor(ms);
    } else {
        return sleep(ms);
    }
}
function normalizeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

// ===================== Tor Setup =====================
async function detectTorPort() {
    const ports = [9050, 9150];
    for (const port of ports) {
        const isOpen = await new Promise((resolve) => {
            const socket = net.createConnection(port, "127.0.0.1");
            socket.on("connect", () => {
                socket.destroy();
                resolve(true);
            });
            socket.on("error", () => resolve(false));
        });
        if (isOpen) return port;
    }
    return null;
}
async function launchBrowserWithTor() {
    const torPort = await detectTorPort();
    if (torPort) {
        console.log(`🔒 Using Tor via socks5://127.0.0.1:${torPort}`);
        return puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", `--proxy-server=socks5://127.0.0.1:${torPort}`],
        });
    } else {
        console.log("⚠️ No Tor detected. Launching without proxy.");
        return puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    }
}
const torControl = new TorControl({
    password: process.env.TOR_PASSWORD || "mypassword",
    port: 9051,
    host: "127.0.0.1",
});
function newTorIdentity() {
    return new Promise((resolve, reject) => {
        torControl.signalNewnym((err) => {
            if (err) {
                console.error("❌ Failed to request new Tor identity:", err.message);
                return reject(err);
            }
            console.log("🔄 Tor identity refreshed (new IP)");
            resolve();
        });
    });
}

// ===================== Image Downloader =====================
async function downloadImage(imageUrl, fileName) {
    if (!imageUrl) return null;
    const dir = path.join("public", "images", "products");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const imgPath = path.join(dir, fileName);

    try {
        const response = await axios({ url: imageUrl, responseType: "stream", timeout: 20000 });
        await new Promise((res, rej) => {
            const stream = fs.createWriteStream(imgPath);
            response.data.pipe(stream);
            stream.on("finish", res);
            stream.on("error", rej);
        });
        return `/images/products/${fileName}`;
    } catch (err) {
        console.error(`Image download failed for ${imageUrl}: ${err.message}`);
        return null;
    }
}

// ===================== Scraper Core =====================
async function scrapePlatform(browser, platformKey, query, categoryDoc) {
    const platform = PLATFORMS[platformKey];
    if (!platform) return;

    let pageNum = 1;
    let consecutiveEmpty = 0;
    const page = await browser.newPage();
    await page.setUserAgent(pickRandom(USER_AGENTS));

    while (pageNum <= MAX_PAGES) {
        const pageUrl = platform.searchUrl(query, pageNum);
        console.log(`→ [${platform.name}] ${query} page ${pageNum}: ${pageUrl}`);

        try {
            await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 60000 });

            // Lazy load scroll for JS-heavy pages
            for (let i = 0; i < 4; i++) {
                await page.evaluate(() => window.scrollBy(0, window.innerHeight));
                await wait(page, 1200); // ✅ version-safe wait
            }

            const html = await page.content();
            const $ = cheerio.load(html);

            const productEls = $(platform.selectors.product);
            console.log(`  found ${productEls.length} product blocks on page ${pageNum}`);

            if (!productEls.length) {
                console.log("⚠️ Still no products, might need selector tune-up or captcha check.");
            }
        } catch (err) {
            console.error(`[${platform.name}] page load failed: ${err.message}`);
            break;
        }

        const html = await page.content();
        const $ = cheerio.load(html);
        const productEls = $(platform.selectors.product);
        console.log(`  found ${productEls.length} products`);

        if (!productEls.length) {
            consecutiveEmpty++;
            if (consecutiveEmpty >= 2) break;
            pageNum++;
            continue;
        }
        consecutiveEmpty = 0;

        for (let i = 0; i < productEls.length; i++) {
            const el = productEls[i];
            const name = $(el).find(platform.selectors.name).text().trim();
            if (!name) continue;

            const normName = normalizeName(name);
            const priceText = $(el).find(platform.selectors.price).text().trim();
            const price = parseFloat(priceText.replace(/[^\d.]/g, "")) || 0;

            const imageUrl = platform.selectors.image(el, $);
            const slug = slugify(name, { lower: true, strict: true });
            const safeName = slug.replace(/[^a-z0-9]/gi, "_") + ".jpg";

            let existing = await Product.findOne({
                $or: [{ slug }, { normalizedName: normName }],
                category: categoryDoc._id,
            });

            let relativeImg = existing?.image || null;
            if (imageUrl && (!existing || !existing.image || !fs.existsSync(path.join("public", existing.image)))) {
                await sleep(randDelay());
                relativeImg = await downloadImage(imageUrl, safeName);
            }

            if (existing) {
                existing.price = price;
                existing.image = relativeImg || existing.image;
                existing.normalizedName = normName;
                await existing.save();
                console.log(`  updated: ${name}`);
            } else {
                try {
                    await Product.create({
                        name,
                        slug,
                        normalizedName: normName,
                        price,
                        description: "",
                        image: relativeImg,
                        category: categoryDoc._id,
                        inStock: true,
                        stock: 10,
                        source: platform.name,
                    });
                    console.log(`  inserted: ${name}`);
                } catch (err) {
                    console.error(`  insert failed for ${name}: ${err.message}`);
                }
            }

            await sleep(randDelay());
        }

        pageNum++;
        if (pageNum % 2 === 0) await newTorIdentity().catch(() => {});
        await sleep(randDelay());
    }

    await page.close();
}

// ===================== Main =====================
(async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ DB connected");

        const browser = await launchBrowserWithTor();

        for (const query of TECH_SECURITY_GAMING_CATEGORIES) {
            const categoryName = query[0].toUpperCase() + query.slice(1);
            let category = await Category.findOne({ name: categoryName });
            if (!category) {
                category = await Category.create({
                    name: categoryName,
                    slug: slugify(categoryName, { lower: true }),
                    lastScrapedPage: 0,
                });
                console.log("📂 Created category:", categoryName);
            }

            for (const platformKey of Object.keys(PLATFORMS)) {
                await scrapePlatform(browser, platformKey, query, category);
            }
        }

        await browser.close();
        await mongoose.disconnect();
        console.log("🎉 All platforms done");
    } catch (err) {
        console.error(err);
    }
})();
