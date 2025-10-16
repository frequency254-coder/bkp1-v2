// ============================================================
// app.js — cleaned, hardened, and logically rearranged
// ============================================================

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const hpp = require("hpp");
const expressLayouts = require("express-ejs-layouts");

// ============================================================
// Optional / dynamic imports
// ============================================================
let MongoStore;
try { MongoStore = require("connect-mongo"); } catch (e) { /* optional */ }

let mime;
try { mime = require("mime"); } catch (e) { mime = null; }

let createAdProvider, expressAdMiddleware;
try {
    const ad = require("./utils/getRandomAd");
    createAdProvider = ad.createAdProvider;
    expressAdMiddleware = ad.expressAdMiddleware;
} catch (e) {
    console.warn("AdProvider not available:", e.message);
}

// ============================================================
// Core modules & utilities
// ============================================================
const CustomError = require("./utils/CustomError");
const globalErrorHandler = require("./controllers/errorController");
const checkDB = require("./middleware/checkDB");
const authController = require("./controllers/authController");

// ============================================================
// Routers
// ============================================================
const viewRouter = require("./routes/viewRoutes");
const moviesRouter = require("./routes/moviesRouter");
const tvshowRouter = require("./routes/tvshowRoutes");
const authRouter = require("./routes/authRouter");
const userRouter = require("./routes/userRouter");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const shopViewRoutes = require("./routes/shopViewRoutes");
const adminOrderRoutes = require("./routes/adminOrderRoutes");
const checkoutRoutes = require("./routes/checkoutRoutes");
const cartRoutes = require("./routes/cartRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const adRoutes = require("./routes/adRoutes");

// ============================================================
// Express setup
// ============================================================
const app = express();
// 🚫 TEMPORARY: Force-disable all CSP headers globally
app.use((req, res, next) => {
    res.removeHeader("Content-Security-Policy");
    res.removeHeader("X-Content-Security-Policy");
    res.removeHeader("X-WebKit-CSP");
    res.setHeader(
        "Content-Security-Policy",
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
    );
    next();
});

const isProd = process.env.NODE_ENV === "production";

if (isProd) app.set("trust proxy", 1);

// ============================================================
// Security & performance
// ============================================================
app.use(compression());
// Disable all Helmet CSP subfeatures
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
}));


// ============================================================
// View engine & layouts
// ============================================================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

// ============================================================
// Logging
// ============================================================
if (!isProd) app.use(morgan("dev"));

// ============================================================
// Parsers
// ============================================================
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Sessions (Mongo or in-memory)
// ============================================================
const sessionConfig = {
    name: process.env.SESSION_NAME || "sid",
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60,
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
    },
};

if (MongoStore && process.env.CONN_STR) {
    sessionConfig.store = MongoStore.create({
        mongoUrl: process.env.CONN_STR,
        ttl: 60 * 60,
    });
} else if (isProd) {
    console.warn("⚠️ connect-mongo not configured. Using in-memory sessions (not for prod).");
}

app.use(session(sessionConfig));

// ============================================================
// CORS
// ============================================================
const allowedOrigins = [
    process.env.FRONTEND_URL || "http://localhost:4000",
    "http://127.0.0.1:4000",
    "http://localhost:5173",
];
app.use(cors({
    origin: (origin, cb) => cb(null, allowedOrigins.includes(origin) || !origin),
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
}));

// ============================================================
// HPP (HTTP parameter pollution protection)
// ============================================================
app.use(hpp({
    whitelist: ["duration", "ratings", "genres", "releaseYear", "releaseDate"],
}));

// ============================================================
// Static assets
// ============================================================
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "frontend")));
app.use(express.static(path.join(__dirname, "public/dist")));

// Product images fallback
app.use("/images/products/:file", (req, res) => {
    const p = path.join(__dirname, "public", "images", "products", req.params.file || "");
    if (!fs.existsSync(p)) {
        return res.sendFile(path.join(__dirname, "public", "images", "products", "default.jpg"));
    }
    res.sendFile(p);
});

// ============================================================
// Optional Ad Provider
// ============================================================
if (createAdProvider && expressAdMiddleware) {
    try {
        const adProvider = createAdProvider({
            adsDir: path.join(__dirname, "public", "ads"),
            publicPrefix: "/ads",
            renameUnsafe: false,
            watch: true,
        });
        app.use(expressAdMiddleware(adProvider, "ad"));
    } catch (e) {
        console.warn("AdProvider initialization failed:", e.message);
    }
}

// ============================================================
// Vite manifest (for production asset resolution)
// ============================================================
let manifest = {};
if (isProd) {
    const manifestPath = path.join(__dirname, "public", "dist", "manifest.json");
    if (fs.existsSync(manifestPath)) {
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
        catch (e) { console.warn("Invalid Vite manifest:", e.message); }
    } else {
        console.warn("Vite manifest not found:", manifestPath);
    }
}

// Inject EJS globals
app.use((req, res, next) => {
    res.locals.isProd = isProd;
    res.locals.vite = {
        css: isProd ? (`/dist/${manifest["frontend/css/style.css"]?.file || "frontend/css/style.css"}`) : "http://localhost:5173/frontend/css/style.css",
        js: isProd ? (`/dist/${manifest["frontend/js/main.js"]?.file || "frontend/js/main.js"}`) : "http://localhost:5173/frontend/js/main.js",
    };
    res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
    next();
});

// ============================================================
// Rate limiting (only in production)
// ============================================================
if (isProd) {
    app.use("/api", rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
    }));

    app.use("/api/v1/auth", rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        message: "Too many attempts. Try again later.",
    }));
}

// ============================================================
// Database check & defaults
// ============================================================
app.use(checkDB);
app.locals.getResponsivePaths = require("./utils/getResponsivePaths");

app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
    res.locals.bodyClass = res.locals.bodyClass || "";
    res.locals.activePage = res.locals.activePage || "";
    res.locals.cart = req.session?.cart || [];
    res.locals.cartCount = res.locals.cart.length;
    res.locals.user = req.user || null;

    res.locals.ad = res.locals.ad || null;
    res.locals.heroImage = "/images/bg-cinema.jpg";
    res.locals.heroSize = "medium";
    res.locals.pageTitle = "Frequency ENT";
    res.locals.pageSubtitle = "";
    res.locals.metaTitle = res.locals.metaTitle || res.locals.pageTitle;
    res.locals.metaDescription =
        res.locals.metaDescription ||
        "Your hub for entertainment, gadgets, movies & PlayStation gaming in Thika.";
    res.locals.metaKeywords =
        res.locals.metaKeywords ||
        "movies, tv shows, playstation, gadgets, shop, Thika, Frequency ENT";
    res.locals.ogImage = res.locals.ogImage || "/images/default-og.jpg";
    res.locals.ogUrl = req.originalUrl;

    res.locals.items = res.locals.items || [];
    res.locals.page = res.locals.page || 1;
    res.locals.totalPages = res.locals.totalPages || 1;
    res.locals.currentGenre = res.locals.currentGenre || "all";
    res.locals.currentSearch = res.locals.currentSearch || "";
    res.locals.inlineAd = res.locals.inlineAd || null;
    res.locals.globalAd = res.locals.globalAd || null;
    res.locals.categories = res.locals.categories || [];
    res.locals.currentCategory = res.locals.currentCategory || "all";
    res.locals.products = res.locals.products || [];
    res.locals.total = res.locals.total || 0;
    res.locals.pageType = res.locals.pageType || "movies";
    res.locals.ads = res.locals.ads || [];
    res.locals.trailer = res.locals.trailer || null;

    next();
});



// ============================================================
// Streaming route for ads
// ============================================================
app.get("/ads/:filename", (req, res) => {
    const videoPath = path.join(__dirname, "public", "ads", req.params.filename);
    if (!fs.existsSync(videoPath)) return res.status(404).send("Video not found");

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    res.setHeader("Cache-Control", "public, max-age=86400");

    const contentType = mime ? (mime.getType(videoPath) || "video/mp4") : "video/mp4";

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        if (start >= fileSize)
            return res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();

        const chunkSize = end - start + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize,
            "Content-Type": contentType,
        });
        file.pipe(res);
    } else {
        res.writeHead(200, {
            "Content-Length": fileSize,
            "Content-Type": contentType,
        });
        fs.createReadStream(videoPath).pipe(res);
    }
});

// ============================================================
// Routes
// ============================================================
app.get("/home", async (req, res) => {
    try {
        // Example: load a random or static ad
        const featuredAd = {
            title: "Enjoy 20% Off Gaming Sessions!",
            image: "/ads/ad1.jpg",
            link: "/offers",
        };

        res.render("home", {
            title: "Home | Frequency ENT",
            pageType: "home",
            featuredAd, // ✅ Pass it here
        });
    } catch (err) {
        console.error("Error loading home page:", err);
        res.status(500).render("error", { message: "Failed to load home page" });
    }
});


app.use("/cart", cartRoutes);
app.use("/checkout", checkoutRoutes);
app.use("/invoice", invoiceRoutes);
app.use("/shop", shopViewRoutes);
app.use("/", viewRouter);

app.use("/admin/orders", authController.protect, adminOrderRoutes);
app.use("/api/v1/user", authController.protect, userRouter);

app.use("/api/v1/movies", moviesRouter);
app.use("/api/v1/tvshows", tvshowRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/ad", adRoutes);

// "Coming soon" routes
app.get("/coming-soon", (req, res) => {
    res.render("comingSoon", {
        layout: "layout",
        title: "Coming Soon - Frequency ENT",
        message: "🚧 This feature is under development. Check back soon!",
    });
});
app.get("/coming-soon/:slug", (req, res) => {
    const { slug } = req.params;
    res.render("comingSoon", {
        layout: "layout",
        title: "Coming Soon - Frequency ENT",
        message: `🚧 The product "${slug}" is under development. Check back soon!`,
    });
});


// 📞 Contact page
app.get("/contact", (req, res) => {
    res.render("contacts", {
        title: "Contact Us | Frequency ENT",
        pageType: "contact",
    });
});

// ============================================================
// Error handling
// ============================================================
app.use((req, res, next) => next(new CustomError(`Can't find ${req.originalUrl} on this server`, 404)));
app.use(globalErrorHandler);

// ============================================================
// Process-level safety
// ============================================================
process.on("uncaughtException", (err) => {
    console.error("UNCAUGHT EXCEPTION - shutting down:", err);
    process.exit(1);
});
process.on("unhandledRejection", (reason) => {
    console.error("UNHANDLED REJECTION - shutting down:", reason);
    process.exit(1);
});

module.exports = app;
