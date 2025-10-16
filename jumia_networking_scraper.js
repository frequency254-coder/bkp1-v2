// scraper.js
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

// =============================
// Helpers
// =============================
function parsePrice(raw) {
    if (!raw) return { value: 0, currency: "UNK", raw };

    // Detect currency code
    let currency = "UNK";
    if (/NGN/.test(raw)) currency = "NGN";
    else if (/KES|KSh/.test(raw)) currency = "KES";
    else if (/R\d/.test(raw)) currency = "ZAR";
    else if (/\$/ .test(raw)) currency = "USD";

    // Extract numeric
    const value = Number(raw.replace(/[^\d.]/g, ""));
    return { value, currency, raw };
}

// Fake exchange rates (should come from API like fixer.io)
const EXCHANGE_RATES = {
    NGN: 0.00065, // 1 NGN ≈ 0.00065 USD
    KES: 0.0076,  // 1 KES ≈ 0.0076 USD
    ZAR: 0.054,   // 1 ZAR ≈ 0.054 USD
    USD: 1
};

function normalizePrice(value, currency) {
    const rate = EXCHANGE_RATES[currency] || 1;
    return +(value * rate).toFixed(2);
}

// ===================== Config =====================
const MONGO_URI = process.env.CONN_STR;
const DEBUG_DIR = path.join(__dirname, "debug_htmls");
if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR);

const TECH_SECURITY_GAMING_CATEGORIES = [
    "laptop",
    "gaming laptop",
    "graphics card",
    "ssd",
    "gaming console",
    "playstation",
    "xbox",
    "nintendo",
    "antivirus",
    "firewall",
    "network switch",
];

const PLATFORMS = {
    slot_ng: (query, page) =>
        `https://slot.ng/catalogsearch/result/?q=${encodeURIComponent(query)}&p=${page}`,
    pc_international: (query, page) =>
        `https://pcinternational.co.za/?s=${encodeURIComponent(query)}&post_type=product&paged=${page}`,
    laptop_clinic_ke: (query, page) =>
        `https://laptopclinic.co.ke/search?q=${encodeURIComponent(query)}&page=${page}`,
};

// ===================== Logger =====================
function logger(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ===================== Tor Detection =====================
async function detectTorPort() {
    const ports = [9050, 9150];
    for (let port of ports) {
        try {
            await new Promise((resolve, reject) => {
                const socket = net.connect(port, "127.0.0.1");
                socket.on("connect", () => {
                    socket.end();
                    resolve();
                });
                socket.on("error", reject);
            });
            return port;
        } catch {}
    }
    return null;
}

// ===================== Product Scraper =====================
async function scrapePlatform(browser, platformKey, query, categoryDoc) {
    logger(`--- ${platformKey} : "${query}" ---`);

    let page;
    try {
        page = await browser.newPage();
        const url = PLATFORMS[platformKey](query, 1);
        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });

        const html = await page.content();
        const $ = cheerio.load(html);

        let products = [];

        if (platformKey === "slot_ng") {
            $(".product-item-info").each((_, el) => {
                const name = $(el).find(".product-item-link").text().trim();
                const priceRaw = $(el).find(".price").first().text().trim();
                if (name && priceRaw) products.push({ name, priceRaw });
            });
        } else if (platformKey === "pc_international") {
            $("ul.products li.product").each((_, el) => {
                const name = $(el).find("h2.woocommerce-loop-product__title").text().trim();
                const priceRaw = $(el).find(".woocommerce-Price-amount").first().text().trim();
                if (name && priceRaw) products.push({ name, priceRaw });
            });
        } else if (platformKey === "laptop_clinic_ke") {
            $(".product-item").each((_, el) => {
                const name = $(el).find(".product-item-meta h2 a").text().trim();
                const priceRaw = $(el).find(".price").first().text().trim();
                if (name && priceRaw) products.push({ name, priceRaw });
            });
        }

        if (products.length === 0) {
            const debugFile = path.join(
                DEBUG_DIR,
                `debug_${platformKey}_${query.replace(/\s+/g, "_")}.html`
            );
            fs.writeFileSync(debugFile, html);
            logger(`⚠️ No products found → ${debugFile}`);
        } else {
            logger(`✅ Found ${products.length} products on ${platformKey}`);
        }

        // Save to DB
        for (let p of products) {
            const slug = slugify(p.name, { lower: true, strict: true });

            const { value, currency, raw } = parsePrice(p.priceRaw);
            const normalized = normalizePrice(value, currency);

            const exists = await Product.findOne({ slug, source: platformKey });
            if (!exists) {
                await Product.create({
                    name: p.name,
                    slug,
                    rawPrice: raw,
                    currency,
                    price: normalized, // USD normalized
                    source: platformKey,
                    category: categoryDoc?._id || null,
                });
            }
        }

        await page.close();
    } catch (err) {
        logger(`❌ Error scraping ${platformKey}: ${err.message}`);
        if (page) await page.close();
    }
}

// ===================== Main =====================
(async () => {
    try {
        await mongoose.connect(MONGO_URI);
        logger("✅ MongoDB connected");

        const torPort = await detectTorPort();
        if (torPort) logger(`Using Tor on port ${torPort}`);
        else logger("⚠️ Tor not detected, direct connection");

        const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox"];
        if (torPort) launchArgs.push(`--proxy-server=socks5://127.0.0.1:${torPort}`);

        const browser = await puppeteer.launch({
            headless: true,
            ignoreHTTPSErrors: true,
            defaultViewport: null,
            args: launchArgs,
        });

        // Process categories one at a time
        for (const query of TECH_SECURITY_GAMING_CATEGORIES) {
            logger(`=== Category: ${query} ===`);

            let categoryDoc = await Category.findOne({ name: query });
            if (!categoryDoc) {
                categoryDoc = new Category({ name: query });
                await categoryDoc.save();
            }

            // Scrape all platforms in parallel
            await Promise.all(
                Object.keys(PLATFORMS).map((platformKey) =>
                    scrapePlatform(browser, platformKey, query, categoryDoc)
                )
            );
        }

        await browser.close();
        await mongoose.disconnect();
        logger("🎉 All platforms done");
    } catch (err) {
        logger(`❌ Fatal: ${err.message}`);
    }
})();
