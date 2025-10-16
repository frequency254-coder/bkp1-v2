const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

// Import your platforms
const platforms = require("./platforms");

(async () => {
    for (const p of platforms) {
        console.log(`\n=== Testing: ${p.name} ===`);
        try {
            const url = p.searchUrl("laptop", 1);
            console.log("URL:", url);

            let html;
            try {
                const res = await axios.get(url, { timeout: 20000 });
                html = res.data;
            } catch (err) {
                console.log("⚠️ Axios failed, retrying with Puppeteer...");
                const browser = await puppeteer.launch({ headless: true });
                const page = await browser.newPage();
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
                html = await page.content();
                await browser.close();
            }

            const $ = cheerio.load(html);
            const products = [];
            $(p.selectors.item).each((i, el) => {
                const name = $(el).find(p.selectors.name).text().trim();
                const price = $(el).find(p.selectors.price).text().trim();
                if (name || price) products.push({ name, price });
            });

            console.log(`✅ Found ${products.length} products`);
            console.log(products.slice(0, 3));

            // Debugging block
            if (
                products.length === 0 ||
                products.some((prod) => !prod.name || prod.name.length === 0)
            ) {
                const debugFile = `debug_${p.name.replace(/\s+/g, "_")}.html`;
                fs.writeFileSync(debugFile, html, "utf-8");
                console.log(`⚠️ Saved debug HTML → ${debugFile}`);
            }
        } catch (err) {
            console.log(`❌ Failed for ${p.name}:`, err.message);
        }
    }
})();
