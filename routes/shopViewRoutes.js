// routes/shop.js
// ============================================
// Shop Router — 10× Upgraded (Bootstrap-ready)
// Features:
//  - safe sanitization + validators
//  - page + cursor pagination (dual-mode)
//  - category caching with TTL and optional changeStream refresh
//  - adaptive aggregation (stable sort, image-first prioritization)
//  - indexes safe-create (best-effort)
//  - SEO + UI context injection
//  - Ad provider integration (async)
//  - JSON API responses for XHR / fetch
// ============================================

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const Product = require("../models/productsModel");
const Category = require("../models/categoryModel");
const getRandomHeroImage = require("../utils/getRandomHeroImage");
const { createAdProvider } = require("../utils/getRandomAd");

const router = express.Router();

/* ---------------------------
   Config / Tunables
   --------------------------- */
const DEFAULT_LIMIT = 18;
const MAX_LIMIT = 48;
const CATEGORY_TTL_MS = 5 * 60 * 1000; // 5 minutes
const COUNT_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes for total counts

/* ---------------------------
   Ad Provider (async fallback tolerant)
   --------------------------- */
let adProvider = null;
try {
    adProvider = createAdProvider({
        adsDir: path.join(__dirname, "../public/ads"),
        publicPrefix: "/ads",
        watch: false,
    });
} catch (err) {
    console.warn("[shop] adProvider init failed, continuing without ads.", err?.message || err);
}

/* ---------------------------
   Safe index creation (best-effort)
   --------------------------- */
(async function ensureIndexes() {
    try {
        await Product.collection.createIndex({ slug: 1 }, { unique: true, background: true });
        await Product.collection.createIndex({ category: 1 }, { background: true });
        await Product.collection.createIndex({ price: 1 }, { background: true });
        await Product.collection.createIndex({ name: "text", description: "text" }, { background: true });
        console.info("[shop] ensured important indexes (best-effort)");
    } catch (err) {
        console.warn("[shop] index creation warning:", err?.message || err);
    }
})();

/* ---------------------------
   Category cache + optional changeStream auto-refresh
   --------------------------- */
let categoryCache = { data: null, expires: 0 };
async function getActiveCategories() {
    return Product.aggregate([
        { $match: { image: { $exists: true, $ne: "", $ne: "/images/default.jpg" } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        {
            $lookup: {
                from: "categories",
                localField: "_id",
                foreignField: "_id",
                as: "category",
            },
        },
        { $unwind: "$category" },
        {
            $project: {
                slug: "$category.slug",
                nameLower: { $toLower: "$category.name" },
                displayName: "$category.name",
                count: 1,
            },
        },
        {
            $group: {
                _id: "$nameLower",
                slug: { $first: "$slug" },
                displayName: { $first: "$displayName" },
                count: { $sum: "$count" },
            },
        },
        { $sort: { displayName: 1 } },
    ]);
}
async function getCachedCategories() {
    const now = Date.now();
    if (categoryCache.data && categoryCache.expires > now) return categoryCache.data;
    const cats = await getActiveCategories();
    categoryCache = { data: cats, expires: now + CATEGORY_TTL_MS };
    return cats;
}
// optional auto-refresh via changeStream (only if running with replica set)
try {
    if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.connection.client) {
        const coll = mongoose.connection.collection("products");
        if (typeof coll.watch === "function") {
            const changeStream = coll.watch([], { fullDocument: "updateLookup" });
            changeStream.on("change", () => {
                // invalidate cache on write
                categoryCache.expires = 0;
            });
        }
    }
} catch (err) {
    /* ignore if not supported */
}

/* ---------------------------
   Small helpers: sanitize + validate
   --------------------------- */
function sanitizeQueryString(s) {
    if (!s) return "";
    if (typeof s !== "string") return "";
    return s.trim().replace(/[^\w\s\-\.\,]/gi, "");
}
function clampInt(val, fallback = 1) {
    const v = parseInt(val, 10);
    return Number.isFinite(v) && v > 0 ? v : fallback;
}
async function resolveCategoryId(slugOrId) {
    if (!slugOrId) return null;
    // if ObjectId-like use it
    if (mongoose.Types.ObjectId.isValid(slugOrId)) return mongoose.Types.ObjectId(slugOrId);
    const cat = await Category.findOne({ slug: slugOrId }).select("_id").lean();
    return cat ? cat._id : null;
}

/* ---------------------------
   Filters builder (defensive)
   --------------------------- */
function buildFilters(query = {}, categoryId = null) {
    const filter = {
        image: { $exists: true, $ne: "", $ne: "/images/default.jpg" },
    };
    if (categoryId) filter.category = categoryId;

    const search = sanitizeQueryString(query.search);
    if (search) {
        const regex = new RegExp(search, "i");
        filter.$or = [{ name: regex }, { description: regex }];
    }

    if (query.minPrice || query.maxPrice) {
        filter.price = {};
        if (query.minPrice) filter.price.$gte = Math.max(0, Number(query.minPrice) || 0);
        if (query.maxPrice) filter.price.$lte = Math.max(0, Number(query.maxPrice) || 0);
    }

    if (query.genre) {
        const g = sanitizeQueryString(query.genre);
        if (g) filter.genres = { $in: [g] };
    }

    if (query.inStock) {
        // example: inStock=1
        filter.stock = { $gt: 0 };
    }

    return filter;
}

/* ---------------------------
   Aggregation / Query functions
   - getProductsPage: stable page-based (hasImage desc, _id desc)
   - getProductsCursor: cursor-based (monotonic _id desc)
   - adaptiveProductPipeline: will be used for both
   --------------------------- */
function baseProductPipeline(match = {}) {
    return [
        { $match: match },
        {
            $addFields: {
                hasImage: {
                    $cond: [
                        { $and: [{ $ifNull: ["$image", false] }, { $ne: ["$image", ""] }, { $ne: ["$image", "/images/default.jpg"] }] },
                        1,
                        0,
                    ],
                },
            },
        },
        {
            $lookup: {
                from: "categories",
                localField: "category",
                foreignField: "_id",
                as: "category",
            },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    ];
}

async function getProductsPage(filter, skip = 0, limit = DEFAULT_LIMIT, sort = { _id: -1 }) {
    const pipeline = [
        ...baseProductPipeline(filter),
        { $sort: { hasImage: -1, ...sort } }, // image-first, deterministic
        { $skip: skip },
        { $limit: limit },
    ];
    return Product.aggregate(pipeline);
}

async function getProductsCursor(filter, cursorObjectId = null, limit = DEFAULT_LIMIT) {
    const match = { ...filter };
    if (cursorObjectId) {
        match._id = { $lt: cursorObjectId };
    }
    const pipeline = [
        ...baseProductPipeline(match),
        { $sort: { _id: -1 } }, // monotonic descending _id
        { $limit: limit + 1 }, // fetch one extra to compute nextCursor
    ];

    const rows = await Product.aggregate(pipeline);
    let nextCursor = null;
    let products = rows;
    if (rows.length > limit) {
        nextCursor = rows[rows.length - 1]._id;
        products = rows.slice(0, limit);
    }
    return { products, nextCursor };
}

/* ---------------------------
   Simple in-memory count cache to reduce expensive counts
   --------------------------- */
let countCache = { value: null, expires: 0 };
async function getCachedCount(filterKey, computeFn) {
    const now = Date.now();
    if (countCache.key === filterKey && countCache.expires > now) return countCache.value;
    const val = await computeFn();
    countCache = { key: filterKey, value: val, expires: now + COUNT_CACHE_TTL_MS };
    return val;
}

/* ---------------------------
   UI/SEO context builder
   --------------------------- */
async function buildUIContext(overrides = {}) {
    const defaultContext = {
        bodyClass: "shop-page",
        theme: "theme-dark",
        heroImage: getRandomHeroImage("shop") || "/images/bg-cinema.jpg",
        heroSize: "large",
        pageTitle: "Welcome to Frequency ENT 🎬",
        pageSubtitle: "Your hub for entertainment & more",
        cart: [],
        cartCount: 0,
        ad: null,
    };
    return { ...defaultContext, ...(overrides || {}) };
}

/* ---------------------------
   Route: GET /shop
   - supports cursor and page modes
   - returns JSON for XHR/API consumers
   - renders EJS for regular HTML requests (Bootstrap-ready)
   --------------------------- */
router.get("/", async (req, res, next) => {
    try {
        // parse + clamp inputs
        const rawCategory = req.query.category || null;
        const cursor = req.query.cursor || null;
        const requestedLimit = Math.max(1, Math.min(MAX_LIMIT, parseInt(req.query.limit || String(DEFAULT_LIMIT), 10)));
        const page = clampInt(req.query.page, 1);

        // resolve category id safely
        const categoryId = rawCategory ? await resolveCategoryId(rawCategory) : null;

        // build filters
        const filter = buildFilters(req.query, categoryId);

        // categories (cached)
        const categories = await getCachedCategories();

        // choose mode: cursor (infinite scroll) preferred if cursor present OR Accept: application/json
        const isXHR = req.xhr || req.get("X-Requested-With") === "XMLHttpRequest";
        const isJSONRequest = req.get("Accept")?.includes("application/json");

// Only return JSON if the user explicitly wants JSON (e.g., API call)
        const wantsJSON = isXHR || (isJSONRequest && !req.accepts("html"));

        if (cursor) {
            const cursorId = mongoose.Types.ObjectId.isValid(cursor) ? mongoose.Types.ObjectId(cursor) : null;
            const { products, nextCursor } = await getProductsCursor(filter, cursorId, requestedLimit);

            const totalProducts = await getCachedCount(JSON.stringify(filter), () => Product.countDocuments(filter));

            if (wantsJSON) {
                return res.json({ ok: true, products, nextCursor, total: totalProducts });
            }

            // server render initial page with cursor context (for progressive enhancement)
            const uiCtx = await buildUIContext({
                products,
                categories,
                totalPages: Math.ceil(totalProducts / requestedLimit),
                currentPage: null,
                nextCursor,
                currentSearch: req.query.search || "",
                currentCategory: rawCategory || "all",
                currentGenre: req.query.genre || "all",
            });

            // attempt to fetch an ad gracefully
            const ad = adProvider ? await adProvider.getRandomAd().catch(() => null) : res.locals.ad || null;
            const cart = req.session?.cart || [];

            return res.render("shop", {
                title: "🛒 Frequency ENT - Shop",
                activePage: "shop",
                products,
                categories,
                ...uiCtx,
                user: req.user || null,
                cart,
                cartCount: cart.length,
                ad,
                seo: {
                    description: "Discover the latest entertainment products.",
                    ogImage: uiCtx.heroImage,
                    twitterCard: "summary_large_image",
                    canonical: req.originalUrl,
                },
            });
        }

        // page mode
        const perPage = requestedLimit;
        const skip = (Math.max(1, page) - 1) * perPage;

        const totalProducts = await getCachedCount(JSON.stringify(filter), () => Product.countDocuments(filter));
        const totalPages = Math.max(1, Math.ceil(totalProducts / perPage));
        const products = await getProductsPage(filter, skip, perPage);

        if (wantsJSON) {
            return res.json({ ok: true, products, total: totalProducts, totalPages, page });
        }

        // server-render normal page
        const uiCtx = await buildUIContext({
            products,
            categories,
            totalPages,
            currentPage: page,
            currentSearch: req.query.search || "",
            currentCategory: rawCategory || "all",
            currentGenre: req.query.genre || "all",
        });

        const ad = adProvider ? await adProvider.getRandomAd().catch(() => null) : res.locals.ad || null;
        const cart = req.session?.cart || [];

        return res.render("shop", {
            title: "🛒 Frequency ENT - Shop",
            activePage: "shop",
            products,
            categories,
            ...uiCtx,
            user: req.user || null,
            cart,
            cartCount: cart.length,
            ad,
            seo: {
                description: "Discover the latest entertainment products.",
                ogImage: uiCtx.heroImage,
                twitterCard: "summary_large_image",
                canonical: req.originalUrl,
            },
        });
    } catch (err) {
        console.error("❌ /shop error:", err);
        next(err);
    }
});

/* ---------------------------
   Route: GET /shop/category/:slug
   (page-based; canonical SEO)
   --------------------------- */
router.get("/category/:slug", async (req, res, next) => {
    try {
        const slug = req.params.slug;
        const category = await Category.findOne({ slug }).lean();
        if (!category) return res.status(404).render("404", { message: "Category not found" });

        const page = clampInt(req.query.page, 1);
        const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(req.query.limit || String(DEFAULT_LIMIT), 10)));
        const skip = (Math.max(1, page) - 1) * limit;

        const categories = await getCachedCategories();
        const filter = buildFilters(req.query, category._id);

        const totalProducts = await getCachedCount(JSON.stringify(filter), () => Product.countDocuments(filter));
        const totalPages = Math.max(1, Math.ceil(totalProducts / limit));
        const products = await getProductsPage(filter, skip, limit);

        const ad = adProvider ? await adProvider.getRandomAd().catch(() => null) : res.locals.ad || null;
        const cart = req.session?.cart || [];

        return res.render("shop", {
            title: `🛒 ${category.name} - Shop`,
            activePage: "shop",
            products,
            categories,
            totalPages,
            currentPage: page,
            user: req.user || null,
            cart,
            cartCount: cart.length,
            currentSearch: req.query.search || "",
            currentCategory: category.slug,
            currentGenre: req.query.genre || "all",
            heroSize: "large",
            pageTitle: category.name,
            pageSubtitle: "Curated selection for this category",
            heroImage: getRandomHeroImage("shop") || "/images/bg-cinema.jpg",
            ad,
            seo: {
                description: `Shop ${category.name} products on Frequency ENT.`,
                ogImage: getRandomHeroImage("shop") || "/images/bg-cinema.jpg",
                twitterCard: "summary_large_image",
                canonical: req.originalUrl,
            },
        });
    } catch (err) {
        console.error("❌ /shop/category/:slug error:", err);
        next(err);
    }
});

/* ---------------------------
   Route: GET /shop/product/:slug (product detail)
   - safer than /:slug to avoid route collisions
   --------------------------- */
router.get("/product/:slug", async (req, res, next) => {
    try {
        const slug = req.params.slug;
        const product = await Product.findOne({ slug }).populate("category", "name slug").lean();
        if (!product) return res.status(404).render("404", { message: "Product not found" });

        // related: prioritize image-bearing products, fallback to random
        const related = await Product.aggregate([
            {
                $match: {
                    category: product.category?._id,
                    _id: { $ne: product._id },
                    image: { $exists: true, $ne: "", $ne: "/images/default.jpg" },
                },
            },
            { $addFields: { hasImage: { $cond: [{ $and: [{ $ifNull: ["$image", false] }, { $ne: ["$image", ""] }] }, 1, 0] } } },
            { $sort: { hasImage: -1, _id: -1 } },
            { $limit: 4 },
        ]);

        const ad = adProvider ? await adProvider.getRandomAd().catch(() => null) : res.locals.ad || null;
        const cart = req.session?.cart || [];

        return res.render("product", {
            title: product.name,
            activePage: "shop",
            product,
            relatedProducts: related,
            user: req.user || null,
            currentSearch: "",
            heroSize: "large",
            pageTitle: product.name,
            pageSubtitle: product.category?.name || "Product Details",
            heroImage: getRandomHeroImage("shop") || "/images/bg-cinema.jpg",
            cart,
            cartCount: cart.length,
            ad,
            metaDescription: product.description?.slice(0, 160) || "Product details and pricing",
            seo: {
                description: product.description?.slice(0, 160) || "Product details and pricing",
                ogImage: product.image || getRandomHeroImage("shop") || "/images/bg-cinema.jpg",
                twitterCard: "summary_large_image",
                canonical: req.originalUrl,
            },
        });
    } catch (err) {
        console.error("❌ /shop/product/:slug error:", err);
        next(err);
    }
});

module.exports = router;
