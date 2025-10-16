// frontend/network.js
// Smart fetch layer with retries, offline detection, cursor-aware pagination,
// and evented integration with state.js and ui.js.

import { state } from "./state.js";
import { showSpinner, hideSpinner, showOffline, hideOffline } from "./ui.js";
import { renderContent } from "./render.js";

// ===============================
// 1. Configurable constants
// ===============================
const API_BASE = "/api/v1";
const MAX_RETRIES = 2;
const RETRY_DELAY = 800;
const CACHE_TTL = 60 * 1000; // 1 minute

const cache = new Map(); // in-memory response cache

// ===============================
// 2. Helpers
// ===============================
function delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

function buildUrl(page = 1, genre = "all", search = "") {
    const basePath = state.get("pageType") === "shop" ? "/api/v1/shop" : `/${state.get("pageType")}`;
    const url = `${basePath}?page=${page}&genre=${encodeURIComponent(genre)}&search=${encodeURIComponent(search)}`;
    return url;
}

function fromCache(url) {
    const item = cache.get(url);
    if (!item) return null;
    if (Date.now() - item.time > CACHE_TTL) {
        cache.delete(url);
        return null;
    }
    return item.data;
}

function toCache(url, data) {
    cache.set(url, { data, time: Date.now() });
}

// ===============================
// 3. Smart Fetch Wrapper
// ===============================
async function fetchJSON(url, { retries = MAX_RETRIES, signal } = {}) {
    const cached = fromCache(url);
    if (cached) return cached;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, { signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            toCache(url, json);
            return json;
        } catch (err) {
            if (err.name === "AbortError") throw err;
            if (attempt < retries) {
                console.warn(`Retry ${attempt + 1}/${retries} after error: ${err.message}`);
                await delay(RETRY_DELAY * (attempt + 1));
                continue;
            }
            throw err;
        }
    }
}

// ===============================
// 4. Core Loader
// ===============================
export async function fetchContent({ page = 1, genre = "all", search = "" }) {
    // abort existing
    state.abortController("fetch");
    const controller = state.createController("fetch");

    // set reactive flags
    state.batch({ isLoading: true, currentGenre: genre, currentSearch: search });
    showSpinner();
    hideOffline();

    const url = buildUrl(page, genre, search);

    try {
        const data = await fetchJSON(url, { signal: controller.signal });
        const items = data?.data?.[state.get("pageType")] || [];
        if (!Array.isArray(items)) throw new Error("Invalid JSON payload");

        renderContent(items);

        // update cursor + pagination
        state.batch({
            currentPage: Number(data.page) || page,
            totalPages: Number(data.totalPages) || state.get("totalPages") || 1,
            cursor: data.nextCursor || null,
        });

        return items.length > 0;
    } catch (err) {
        if (err.name !== "AbortError") {
            console.warn("⚠️ Fetch failed:", err.message);
            showOffline("Network error. Try again later.");
        }
        return false;
    } finally {
        state.set("isLoading", false);
        hideSpinner();
    }
}

// ===============================
// 5. Infinite Scroll Support
// ===============================
let scrollHandlerAttached = false;

export function initInfiniteScroll() {
    if (scrollHandlerAttached) return;
    scrollHandlerAttached = true;

    window.addEventListener(
        "scroll",
        async () => {
            const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 500;
            if (!nearBottom) return;
            if (state.get("isLoading")) return;
            if (state.get("currentPage") >= state.get("totalPages")) return;

            const nextPage = state.get("currentPage") + 1;
            console.log("⬇️ Auto-loading page", nextPage);

            const ok = await fetchContent({
                page: nextPage,
                genre: state.get("currentGenre"),
                search: state.get("currentSearch"),
            });

            if (!ok) console.warn("No new data or fetch failed.");
        },
        { passive: true }
    );
}

// ===============================
// 6. Online/Offline Awareness
// ===============================
window.addEventListener("online", hideOffline);
window.addEventListener("offline", () => showOffline("You're offline — content may be stale."));

// ===============================
// 7. Preload Hero Image (with async cache)
// ===============================
export async function getRandomHeroImage(section = "default") {
    const key = `hero:${section}`;
    const cached = fromCache(key);
    if (cached) return cached;

    try {
        const res = await fetch(`${API_BASE}/hero?section=${encodeURIComponent(section)}`);
        if (!res.ok) throw new Error("Failed hero fetch");
        const { image } = await res.json();
        toCache(key, image);
        return image;
    } catch {
        return "/images/bg-cinema.jpg";
    }
}
