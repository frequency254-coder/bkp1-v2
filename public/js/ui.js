// frontend/js/ui.js — 10x upgraded version
"use strict";


/**
 * Universal UI controller
 * Handles spinners, offline banners, theme changes, and subtle glow themes.
 * Fully idempotent — safe to re-import or re-run after partial reloads.
 */

// ==========================
//  SELECTORS (cached)
// ==========================
const spinner = document.getElementById("loadingSpinner");
const offline = document.getElementById("offlineBanner");
const body = document.body;

// ==========================
//  SPINNER CONTROL
// ==========================
export function showSpinner(msg) {
    if (!spinner) return;
    if (msg) spinner.setAttribute("data-message", msg);
    spinner.classList.remove("d-none");
    spinner.classList.add("fade-in");
}
export function hideSpinner() {
    if (!spinner) return;
    spinner.classList.add("fade-out");
    setTimeout(() => spinner.classList.add("d-none"), 300);
}

// ==========================
//  OFFLINE / ONLINE STATUS
// ==========================
export function showOffline(msg = "You appear offline. Some features may be unavailable.") {
    if (!offline) return;
    offline.textContent = msg;
    offline.classList.remove("d-none");
    offline.classList.add("show");
}
export function hideOffline() {
    if (!offline) return;
    offline.classList.remove("show");
    setTimeout(() => offline.classList.add("d-none"), 400);
}

// Monitor browser connection state
window.addEventListener("online", hideOffline);
window.addEventListener("offline", () => showOffline("You are offline."));

// ==========================
//  TEXT UTILITY
// ==========================
export function safeTruncate(text = "", n = 120) {
    if (typeof text !== "string" || !text) return "No description available.";
    return text.length > n ? text.slice(0, n).trimEnd() + "…" : text;
}

// ==========================
//  RANDOMIZED NEON THEMES
// ==========================
export function applyRandomThemes() {
    const themes = ["theme-blue", "theme-red", "theme-green", "theme-purple", "theme-gold"];
    document.querySelectorAll(".pulse-glow").forEach(el => {
        if (!(el instanceof HTMLElement)) return;
        themes.forEach(t => el.classList.remove(t));
        const newTheme = themes[Math.floor(Math.random() * themes.length)];
        el.classList.add(newTheme);
    });
}

// ==========================
//  THEME HANDLING (sync with data-theme)
// ==========================
export function toggleTheme() {
    const current = body.getAttribute("data-theme") || "cinematic";
    const next = current === "cinematic" ? "techy" : "cinematic";
    body.setAttribute("data-theme", next);
    try { localStorage.setItem("freqent.theme", next); } catch {}
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
}
export function restoreTheme() {
    try {
        const saved = localStorage.getItem("freqent.theme");
        if (saved) body.setAttribute("data-theme", saved);
    } catch {}
}

// ==========================
//  PAGE VISIBILITY HOOK
// ==========================
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        // optional: pause background animations or video
        document.body.classList.add("paused");
    } else {
        document.body.classList.remove("paused");
    }
});

// ==========================
//  INIT
// ==========================
export function initUI() {
    restoreTheme();
    applyRandomThemes();
    console.log("%c[UI] Initialized", "color:#0ff;font-weight:bold");
}
export function cycleTheme() {
    const html = document.documentElement;
    const themes = ["midtone", "neon", "dark", "cinematic"];
    const current = html.getAttribute("data-theme") || "midtone";
    const next = themes[(themes.indexOf(current) + 1) % themes.length];
    switchTheme(next);
    console.log(`[Theme] Switched → ${next}`);
}

// Auto-init (safe)
if (!window.__uiLoaded) {
    window.__uiLoaded = true;
    document.addEventListener("DOMContentLoaded", initUI);
}
