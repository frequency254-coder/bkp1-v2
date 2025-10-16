// frontend/js/ads.js
// Pro-mode ad rotator (ES module). Exports rotateAds(options) -> controller { stop, refreshNow, getState }.

const DEFAULTS = {
    slotSelector: ".ad-banner",
    api: "/api/v1/ad?count=1",
    defaultInterval: 30_000,
    fetchTimeout: 8_000,
    maxRetries: 3,
    backoffFactor: 2,
    cacheName: "ads-cache-v1",
    analyticsEndpoint: "/api/v1/ad/event",
    prefetchImages: true,
    prefetchVideoMetaOnly: true,
    minVideoPlayVisibility: 0.5,
    allowVideoOnSlowConnection: false,
    progressBar: true,
    recentlyShownLimit: 20,
    storageKey: "ads.lastShown",
    lowBandwidthThreshold: 0.5, // Mbps
    staggerStartMax: 2000,
};

// ---------- helpers ----------
function now() { return Date.now(); }

async function fetchWithTimeout(url, opts = {}, ms = 8000) {
    const controller = new AbortController();
    const signal = controller.signal;
    if (opts.signal) {
        const parent = opts.signal;
        parent.addEventListener("abort", () => controller.abort(), { once: true });
    }
    opts.signal = signal;
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(url, opts);
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

function sendAnalytics(payload, url) {
    try {
        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
            navigator.sendBeacon(url, blob);
            return Promise.resolve();
        }
    } catch (e) { /* fallthrough */ }

    return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
    }).catch(()=>{});
}

function weightedPick(items, weightFn) {
    const total = items.reduce((s,i)=>s + Math.max(0, weightFn(i) || 0), 0);
    if (total <= 0) return items[Math.floor(Math.random() * items.length)];
    let r = Math.random() * total;
    for (const it of items) {
        r -= Math.max(0, weightFn(it) || 0);
        if (r <= 0) return it;
    }
    return items[items.length-1];
}

async function cachePut(url, name="ads-cache-v1") {
    if (!("caches" in window)) return;
    try {
        const cache = await caches.open(name);
        await cache.add(new Request(url, { mode: "cors" }));
    } catch (e) { /* ignore */ }
}

// ---------- main ----------
export async function rotateAds(userOptions = {}) {
    const opt = { ...DEFAULTS, ...userOptions };
    const slots = Array.from(document.querySelectorAll(opt.slotSelector));
    if (!slots.length) return { stop(){}, refreshNow: async()=>{}, getState: ()=>({}) };

    // state
    const state = {
        slots: new Map(),
        recent: loadRecent(opt.storageKey) || [],
        stopped: false,
        ctr: new Map(),
    };

    let pageHidden = document.visibilityState === "hidden";
    document.addEventListener("visibilitychange", () => pageHidden = document.visibilityState === "hidden");

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    function isLowBandwidth() {
        try {
            if (!opt.allowVideoOnSlowConnection) {
                const down = connection.downlink || Infinity;
                if (typeof down === "number" && down < opt.lowBandwidthThreshold) return true;
            }
        } catch {}
        return false;
    }

    // IntersectionObserver for play/pause + mute reset
    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const slot = entry.target;
            const v = slot.querySelector("video");
            const toggle = slot.querySelector(".ad-sound-toggle");
            if (!v) return;

            if (entry.intersectionRatio >= opt.minVideoPlayVisibility) {
                if (v.paused) v.play().catch(()=>{});
            } else {
                v.pause();
                v.muted = true; // reset to muted when leaving
                if (toggle) {
                    toggle.dataset.muted = "true";
                    toggle.textContent = "🔇";
                }
            }
        });
    }, { threshold: [0, opt.minVideoPlayVisibility, 1] });

    // init slots
    slots.forEach(slot => {
        state.slots.set(slot, { currentId: null, timer: null, progressEl: null });
        io.observe(slot);

        slot.addEventListener("click", (ev) => {
            const s = state.slots.get(slot);
            const adId = s?.currentId;
            if (!adId) return;
            const stats = state.ctr.get(adId) || { clicks:0, impressions:0 };
            stats.clicks++;
            state.ctr.set(adId, stats);
            sendAnalytics({ type: "click", adId, ts: now(), href: ev.target?.closest("a")?.href || null }, opt.analyticsEndpoint);
        });
    });

    // progress bar helper
    function createProgressBar(slot) {
        if (!opt.progressBar) return null;
        const el = document.createElement("div");
        el.className = "ad-progress";
        Object.assign(el.style, {
            position: "absolute",
            left: "0", right: "0", bottom: "0",
            height: "4px",
            background: "linear-gradient(90deg, rgba(255,255,255,0.35), rgba(255,255,255,0.05))",
            transformOrigin: "left",
            transform: "scaleX(0)",
            transition: "transform linear",
            zIndex: "10"
        });
        slot.style.position = slot.style.position || "relative";
        slot.appendChild(el);
        return el;
    }

    function markShown(adId) {
        state.recent.unshift(adId);
        if (state.recent.length > opt.recentlyShownLimit) state.recent.length = opt.recentlyShownLimit;
        try { localStorage.setItem(opt.storageKey, JSON.stringify(state.recent)); } catch {}
    }
    function loadRecent(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : [];
        } catch { return []; }
    }

    // fetch ad with retries/backoff
    async function fetchAdWithRetry() {
        let attempt = 0;
        let wait = 300;
        while (attempt < opt.maxRetries) {
            attempt++;
            try {
                const res = await fetchWithTimeout(opt.api, { credentials: "same-origin" }, opt.fetchTimeout);
                if (!res.ok) throw new Error("HTTP " + res.status);
                const data = await res.json().catch(()=>null);
                const ad = (data && data.ad) ? data.ad : data;
                if (!ad) throw new Error("Invalid ad payload");
                ad.videoSrc = ad.videoSrc || ad.video || ad.video_url || ad.videoUrl || null;
                ad.imageSrc = ad.imageSrc || ad.image || ad.image_url || ad.imageUrl || null;
                ad.meta = ad.meta || {};
                ad._id = ad.meta?.name || ad.imageSrc || ad.videoSrc || `${Date.now()}-${Math.random()}`;
                ad._weight = ad.meta?.weight ?? 1;
                return ad;
            } catch (err) {
                if (attempt >= opt.maxRetries) throw err;
                await new Promise(r => setTimeout(r, wait));
                wait *= opt.backoffFactor;
            }
        }
    }

    // apply ad to slot
    async function applyAdToSlot(slot, ad) {
        if (!slot || !ad) return false;
        const slotState = state.slots.get(slot);
        if (!slotState) return false;

        if (slotState.currentId === ad._id) {
            const s = state.ctr.get(ad._id) || { clicks:0, impressions:0 };
            s.impressions++;
            state.ctr.set(ad._id, s);
            return false;
        }

        while (slot.firstChild) slot.removeChild(slot.firstChild);
        slotState.progressEl = createProgressBar(slot);

        if (ad.videoSrc && !isLowBandwidth()) {
            const wrapper = document.createElement("div");
            wrapper.className = "ad-video-wrapper position-relative";

            const video = document.createElement("video");
            video.src = ad.videoSrc;
            video.preload = opt.prefetchVideoMetaOnly ? "metadata" : (ad.meta?.preload || "metadata");
            video.muted = true; // default muted
            video.playsInline = true;
            video.loop = ad.meta?.loop ?? true;
            video.className = "ad-video img-fluid w-100";
            if (ad.videoPoster) video.poster = ad.videoPoster;

            // --- 🔊 Sound toggle button ---
            const toggle = document.createElement("button");
            toggle.className = "ad-sound-toggle btn btn-sm btn-dark rounded-circle position-absolute bottom-0 end-0 m-2";
            toggle.type = "button";
            toggle.dataset.muted = "true";
            toggle.textContent = "🔇";

            // accessibility
            toggle.setAttribute("aria-pressed", String(video.muted === false));
            toggle.setAttribute("aria-label", "Toggle sound for advertisement");
            toggle.title = "Unmute";

            // keyboard accessibility
            toggle.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle.click();
                }
            });

            // toggle click handler
            toggle.addEventListener("click", () => {
                video.muted = !video.muted;
                toggle.dataset.muted = String(video.muted);
                toggle.setAttribute("aria-pressed", String(!video.muted));
                toggle.textContent = video.muted ? "🔇" : "🔊";
                toggle.title = video.muted ? "Unmute" : "Mute";

                try { localStorage.setItem("ads.soundMuted", video.muted ? "1" : "0"); } catch {}
            });

            wrapper.appendChild(video);
            wrapper.appendChild(toggle);
            slot.appendChild(wrapper);

            // preload hint
            const link = document.createElement("link");
            link.rel = "preload";
            link.as = "video";
            link.href = ad.videoSrc;
            document.head.appendChild(link);
            setTimeout(()=>link.remove(), 30_000);

            if (!video.loop) {
                video.addEventListener("ended", () => scheduleSlotNext(slot, 0), { once: true });
            }

            const rect = slot.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                video.play().catch(()=>{});
            }
        } else if (ad.imageSrc) {
            const a = document.createElement("a");
            a.href = ad.buttonLink || ad.linkHref || "#";
            a.className = "ad-image-link d-block";
            const img = document.createElement("img");
            img.loading = "lazy";
            img.decoding = "async";
            img.className = "ad-img img-fluid w-100";
            img.alt = ad.title || "Advertisement";
            img.src = ad.imageSrc;
            img.onerror = () => { img.src = "/images/default.jpg"; };
            a.appendChild(img);
            slot.appendChild(a);
            if (opt.prefetchImages) cachePut(ad.imageSrc, opt.cacheName);
        } else {
            slotState.currentId = null;
            return false;
        }

        slotState.currentId = ad._id;
        const stats = state.ctr.get(ad._id) || { clicks:0, impressions:0 };
        stats.impressions++;
        state.ctr.set(ad._id, stats);
        markShown(ad._id);
        sendAnalytics({ type: "impression", adId: ad._id, ts: now() }, opt.analyticsEndpoint);

        // --- Progress bar animation ---
        if (slotState.progressEl) {
            const durationMs = Math.max(3000, Math.floor((ad.meta?.duration ? ad.meta.duration*1000 : opt.defaultInterval)));
            slotState.progressEl.style.transition = `transform ${durationMs}ms linear`;
            requestAnimationFrame(()=> slotState.progressEl.style.transform = "scaleX(1)");
        }

        return true;
    }


    function scheduleSlotNext(slot, delay = opt.defaultInterval) {
        const slotState = state.slots.get(slot);
        if (!slotState) return;
        if (state.stopped) return;
        clearTimeout(slotState.timer);
        slotState.timer = setTimeout(async () => {
            try {
                await tickSlot(slot);
            } catch (err) {
                const backoff = Math.min(opt.defaultInterval * opt.backoffFactor, opt.defaultInterval * 16);
                slotState.timer = setTimeout(()=> tickSlot(slot).catch(()=>{}), backoff);
            }
        }, delay);
    }

    async function tickSlot(slot) {
        if (pageHidden) {
            scheduleSlotNext(slot, opt.defaultInterval * 4);
            return;
        }

        const ad = await fetchAdWithRetry();
        let chosen = ad;
        if (Array.isArray(ad)) {
            chosen = weightedPick(ad, (a) => {
                const penalty = state.recent.includes(a.meta?.name || a._id) ? 0.2 : 1;
                return (a.meta?.weight ?? 1) * penalty;
            });
        }

        if (state.recent.includes(chosen._id)) {
            // small chance of repeat is fine
        }

        if (chosen.imageSrc && opt.prefetchImages) cachePut(chosen.imageSrc, opt.cacheName);

        await applyAdToSlot(slot, chosen);

        const delay = (chosen.meta && chosen.meta.duration && !chosen.meta.loop)
            ? Math.max(3000, Math.floor(chosen.meta.duration * 1000))
            : opt.defaultInterval;

        const slotState = state.slots.get(slot);
        if (slotState && slotState.progressEl) {
            slotState.progressEl.style.transition = "none";
            slotState.progressEl.style.transform = "scaleX(0)";
            void slotState.progressEl.offsetWidth;
        }

        scheduleSlotNext(slot, delay);
    }

    async function refreshAllNow() {
        await Promise.all(slots.map(s => tickSlot(s).catch(()=>{})));
    }

    slots.forEach((slot, idx) => {
        scheduleSlotNext(slot, Math.min(1000 * idx, opt.staggerStartMax));
    });

    function stop() {
        state.stopped = true;
        slots.forEach(slot => {
            const s = state.slots.get(slot);
            if (s?.timer) clearTimeout(s.timer);
        });
        io.disconnect();
    }

    function getState() {
        return {
            stopped: state.stopped,
            recent: Array.from(state.recent),
            ctr: Array.from(state.ctr.entries()).reduce((o,[k,v]) => (o[k]=v, o), {})
        };
    }

    return {
        stop,
        async refreshNow() { await refreshAllNow(); },
        getState,
    };
}
