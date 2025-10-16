// routes/adRoutes.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const { getRandomAds } = require("../utils/getRandomAd");
const { recordAdEvent } = require("../utils/adAnalytics");

const router = express.Router();

// light rate-limit per IP for ad fetches
const fetchLimiter = rateLimit({
    windowMs: 10 * 1000, // 10s
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
});

const eventLimiter = rateLimit({
    windowMs: 60 * 1000, // 1min
    max: 120, // events per IP per minute
    standardHeaders: true,
    legacyHeaders: false,
});

// GET /api/v1/ad?count=1
router.get("/", fetchLimiter, async (req, res) => {
    const count = Math.min(Math.max(parseInt(req.query.count || "1", 10) || 1, 1), 10);
    try {
        const ads = await getRandomAds(count);
        // normalize to single-ad / multi-ad response for convenience
        res.json({
            ok: true,
            meta: {
                returned: ads.length,
                requested: count,
                serverTime: Date.now(),
            },
            ads, // array of ad objects; each ad must contain meta.name (stable id)
        });
    } catch (err) {
        console.error("Ad fetch error:", err);
        res.status(500).json({ ok: false, message: "Ad fetch failed" });
    }
});

// POST /api/v1/ad/event  { type: 'impression'|'click', adId: 'name', extra: {} }
router.post("/event", eventLimiter, express.json(), async (req, res) => {
    const { type, adId, extra } = req.body || {};
    if (!type || !["impression", "click"].includes(type)) {
        return res.status(400).json({ ok: false, message: "Invalid type" });
    }
    if (!adId || typeof adId !== "string") {
        return res.status(400).json({ ok: false, message: "Invalid adId" });
    }

    try {
        await recordAdEvent({ type, adId, ip: req.ip, ua: req.get("User-Agent") || "", extra });
        return res.json({ ok: true });
    } catch (err) {
        console.error("Ad event error:", err);
        return res.status(500).json({ ok: false, message: "Event recording failed" });
    }
});

module.exports = router;
