/* ============================================================
   config.js — Ultra Adaptive Configuration System (v3.5)
   Purpose: Frontend-wide configuration, theming, and runtime control.
   Author: Frequency ENT System Upgrade Series
   ============================================================ */

"use strict";

// Safe window/document detection for SSR or preload environments
const hasDOM = typeof document !== "undefined" && typeof window !== "undefined";

// -----------------------------------------------
// Internal Logger (respects environment)
// -----------------------------------------------
const Log = {
    info: (...msg) => AppConfig?.env !== "production" && console.info("[Config]", ...msg),
    warn: (...msg) => console.warn("[Config WARN]", ...msg),
    error: (...msg) => console.error("[Config ERROR]", ...msg)
};

// -----------------------------------------------
// Environment Detection
// -----------------------------------------------
const hostname = hasDOM ? location.hostname : "localhost";
const isLocal = hostname === "localhost" || hostname.includes("127.");
const isStaging = hostname.includes("staging") || hostname.includes("test");
const isProd = !isLocal && !isStaging;

// -----------------------------------------------
// Base Configuration
// -----------------------------------------------
const base = {
    env: isProd ? "production" : isStaging ? "staging" : "development",
    version: "3.5.0",
    apiBase: isProd
        ? "/api"
        : isStaging
            ? "https://staging.example.com/api"
            : "http://localhost:3000/api",
    cdnBase: isProd
        ? "/cdn"
        : isStaging
            ? "https://staging.example.com/cdn"
            : "http://localhost:3000/public",
    enableAds: true,
    enableAnalytics: isProd,
    enableCache: true,
    defaultTheme: "midtone",
    experimentalUI: true,
    maxCacheAge: 1000 * 60 * 10,
    themeList: ["midtone", "neon", "dark", "cinematic"],
    autoTheme: true // picks time-based theme if true
};

// -----------------------------------------------
// Safe override loader
// -----------------------------------------------
function loadOverrides() {
    try {
        const query = hasDOM ? new URLSearchParams(location.search) : new URLSearchParams();
        const fromStorage = JSON.parse(localStorage.getItem("AppConfigOverrides") || "{}");
        const fromQuery = {};
        for (const [key, value] of query.entries()) {
            if (key.startsWith("cfg_")) fromQuery[key.replace("cfg_", "")] = parseValue(value);
        }
        return { ...fromStorage, ...fromQuery };
    } catch (err) {
        Log.warn("Failed to load overrides:", err);
        return {};
    }
}

// Convert common strings to native types
function parseValue(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    if (!isNaN(value)) return Number(value);
    return value;
}

// -----------------------------------------------
// Apply Theme
// -----------------------------------------------
function applyTheme(themeName) {
    if (!hasDOM) return;
    const html = document.documentElement;
    if (!base.themeList.includes(themeName)) themeName = base.defaultTheme;
    html.setAttribute("data-theme", themeName);
    localStorage.setItem("activeTheme", themeName);
    Log.info("Theme applied:", themeName);
}

// Auto-theme logic
function pickAutoTheme() {
    const hour = new Date().getHours();
    if (hour >= 19 || hour < 6) return "cinematic";
    if (hour >= 6 && hour < 12) return "midtone";
    if (hour >= 12 && hour < 19) return "neon";
    return "midtone";
}

// -----------------------------------------------
// Main Config Constructor
// -----------------------------------------------
export const AppConfig = (() => {
    const overrides = loadOverrides();
    const merged = { ...base, ...overrides };

    // Auto-theme mode
    if (hasDOM) {
        let activeTheme =
            overrides.defaultTheme ||
            localStorage.getItem("activeTheme") ||
            (merged.autoTheme ? pickAutoTheme() : merged.defaultTheme);
        applyTheme(activeTheme);
    }

    Log.info("Initialized environment:", merged.env);
    return merged;
})();

// -----------------------------------------------
// Public Config Control Helpers
// -----------------------------------------------
export function setConfigOverride(key, value) {
    try {
        const overrides = JSON.parse(localStorage.getItem("AppConfigOverrides") || "{}");
        overrides[key] = value;
        localStorage.setItem("AppConfigOverrides", JSON.stringify(overrides));
        Log.info(`Override set: ${key} = ${value}`);
    } catch (err) {
        Log.error("Failed to set override:", err);
    }
}

export function resetConfigOverrides() {
    try {
        localStorage.removeItem("AppConfigOverrides");
        Log.info("Overrides cleared.");
    } catch (err) {
        Log.error("Failed to clear overrides:", err);
    }
}

export function switchTheme(themeName) {
    applyTheme(themeName);
}

// -----------------------------------------------
// Live Watcher (optional advanced feature)
// -----------------------------------------------
if (hasDOM && "storage" in window) {
    window.addEventListener("storage", (e) => {
        if (e.key === "AppConfigOverrides") {
            Log.info("Detected config change — reloading.");
            location.reload();
        }
    });
}
