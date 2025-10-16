// utils/adAnalytics.js
// Simple in-memory store — replace with DB/Redis for production.
const store = {
    impressions: {}, // name -> count
    clicks: {},      // name -> count
};

async function recordAdEvent({ type, adId, ip = "", ua = "", extra = {} }) {
    if (!adId) throw new Error("adId required");
    const target = type === "click" ? store.clicks : store.impressions;
    target[adId] = (target[adId] || 0) + 1;
    // Optionally persist to a log file for now
    if (!process.env.DISABLE_AD_LOG) {
        const line = JSON.stringify({ time: Date.now(), type, adId, ip, ua, extra }) + "\n";
        require("fs").appendFileSync(require("path").join(process.cwd(), "logs", "ad_events.log"), line, { encoding: "utf8", flag: "a" });
    }
    return true;
}

function getStats() {
    return { impressions: { ...store.impressions }, clicks: { ...store.clicks } };
}

module.exports = { recordAdEvent, getStats };
