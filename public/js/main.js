/* ==========================================================
   main.js — Frequency ENT v3.5 (Pro Unified Hybrid Mode)
   Supports: SSR + Hybrid client, Movies, TV, Shop, Ads, Search, Trailers
   Safe, Idempotent, Progressive Loading
   ========================================================== */

"use strict";

if (window.__mainScriptLoadedUnified) {
    console.warn("main.js already initialized.");
} else {
    window.__mainScriptLoadedUnified = true;

    // =========================
    // Core State
    // =========================
    const state = {
        pageType:
            document.body?.dataset?.pageType ||
            location.pathname.split("/").filter(Boolean)[0] ||
            "movies",
        currentPage: 1,
        totalPages: 1,
        currentGenre: "all",
        currentSearch: "",
        isLoading: false,
    };

    // =========================
    // DOM Cache
    // =========================
    const DOM = {
        genreLinks: document.querySelector(".genre-pills, #genreLinks"),
        pagination: document.querySelector(".pagination"),
        searchInput:
            document.querySelector("#searchInput") ||
            document.querySelector("input[name='search']"),
        grid:
            document.getElementById(`${state.pageType}Container`) ||
            document.querySelector(".content-grid"),
    };

    // =========================
    // Utility Helpers
    // =========================
    const escapeHtml = (str = "") =>
        String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

    const normalizeTrailerUrl = (raw) => {
        if (!raw) return "";
        try {
            const u = new URL(raw, location.origin);
            const host = u.hostname.toLowerCase();
            if (host.includes("youtube.com") && u.searchParams.get("v"))
                return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
            if (host.includes("youtu.be"))
                return `https://www.youtube.com/embed/${u.pathname.replace("/", "")}`;
            if (
                host.includes("youtube-nocookie.com") ||
                host === location.hostname
            )
                return u.href;
        } catch {}
        return "";
    };

    const setLoading = (on) => {
        state.isLoading = !!on;
        let el = document.getElementById("ajax-loading");
        if (!el) {
            el = document.createElement("div");
            el.id = "ajax-loading";
            el.style.cssText = `
        position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.4);color:#fff;font-weight:600;z-index:9999;
        opacity:0;transition:opacity .25s`;
            el.innerHTML = "<div>Loading…</div>";
            document.body.appendChild(el);
        }
        el.style.opacity = on ? "1" : "0";
    };

    const setActiveGenre = (genre) => {
        if (!DOM.genreLinks) return;
        DOM.genreLinks.querySelectorAll(".genre-pill").forEach((pill) => {
            const match =
                (pill.dataset.genre || "").toLowerCase() === genre.toLowerCase();
            pill.classList.toggle("active", match);
            pill.setAttribute("aria-pressed", match ? "true" : "false");
        });
    };

    // =========================
    // SSR Mode
    // =========================
    function enableSSRMode() {
        console.log("[MODE] SSR active for:", state.pageType);
        bindGenreHighlight();
        bindSearch();
        bindTrailerModal();
        setActiveGenre(state.currentGenre);
        if (window.setupAdVideos) window.setupAdVideos();
    }

    function bindGenreHighlight() {
        if (!DOM.genreLinks) return;
        DOM.genreLinks.addEventListener("click", (e) => {
            const pill = e.target.closest(".genre-pill");
            if (!pill) return;
            document
                .querySelectorAll(".genre-pill")
                .forEach((p) => p.classList.remove("active"));
            pill.classList.add("active");
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    function bindSearch() {
        if (!DOM.searchInput) return;
        const form = DOM.searchInput.closest("form");
        const handler = () =>
            window.scrollTo({ top: 0, behavior: "smooth" });
        if (form) form.addEventListener("submit", handler);
        else DOM.searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") handler();
        });
    }

    function bindTrailerModal() {
        document.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-trailer]");
            if (!btn) return;
            const url = normalizeTrailerUrl(btn.dataset.trailer);
            const iframe = document.querySelector("#trailerModal iframe");
            if (!iframe) return;
            iframe.src = url.includes("?") ? `${url}&autoplay=1` : `${url}?autoplay=1`;
            const modal = document.getElementById("trailerModal");
            if (modal && typeof bootstrap !== "undefined") {
                new bootstrap.Modal(modal).show();
            }
        });

        const trailerModal = document.getElementById("trailerModal");
        if (trailerModal) {
            trailerModal.addEventListener("hidden.bs.modal", () => {
                const iframe = trailerModal.querySelector("iframe");
                if (iframe) iframe.src = "";
            });
        }
    }

    document.addEventListener(
        "error",
        (e) => {
            const t = e.target;
            if (t.tagName === "IMG" && t.classList.contains("poster-img"))
                t.src = "/images/default.jpg";
        },
        true
    );

    // =========================
    // Hybrid AJAX Mode
    // =========================
    async function fetchContent({ page = 1, genre = "all", search = "" } = {}) {
        if (state.isLoading) return;
        setLoading(true);
        const url = `/api/v1/${encodeURIComponent(
            state.pageType
        )}?page=${page}&genre=${encodeURIComponent(
            genre
        )}&search=${encodeURIComponent(search)}`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            const items =
                data.data?.[state.pageType] ||
                data.data ||
                data.items ||
                data.results ||
                [];
            renderContent(items);
            state.currentPage = page;
            state.currentGenre = genre;
            state.currentSearch = search;
            state.totalPages =
                data.totalPages || data.total_pages || data.pageCount || 1;
        } catch (err) {
            console.warn("[FETCH FAIL]", err);
        } finally {
            setLoading(false);
        }
    }

    function renderContent(items = []) {
        const grid = DOM.grid;
        if (!grid) return;
        grid.innerHTML = "";

        if (!items.length) {
            grid.innerHTML = `<p class="empty-msg text-center text-muted">No ${state.pageType} found.</p>`;
            return;
        }

        const frag = document.createDocumentFragment();
        for (const item of items) {
            const title = escapeHtml(item.title || item.name || "Untitled");
            const poster = escapeHtml(
                item.poster_path || item.poster || "/images/default.jpg"
            );
            const year =
                item.releaseYear ||
                item.release_date?.split("-")[0] ||
                item.first_air_date?.split("-")[0] ||
                "";
            const trailer = normalizeTrailerUrl(item.trailer || item.trailerUrl);

            const card = document.createElement("div");
            card.className = "col content-card fade-in-section";
            card.innerHTML = `
        <div class="poster-wrapper position-relative">
          <img class="poster-img w-100 rounded" src="${poster}" alt="${title}">
          ${year ? `<span class="badge bg-dark position-absolute top-0 end-0 m-2">${year}</span>` : ""}
          ${
                trailer
                    ? `<div class="overlay d-flex justify-content-center align-items-center">
                  <button class="btn btn-outline-light btn-trailer" data-trailer="${trailer}">▶ Trailer</button>
                </div>`
                    : ""
            }
        </div>
        <div class="mt-2 text-center">
          <h6 class="text-white fw-semibold">${title}</h6>
        </div>`;
            frag.appendChild(card);
        }
        grid.appendChild(frag);
    }

    function enableHybridMode() {
        console.log("[MODE] Hybrid client-side active:", state.pageType);
        bindSearch();
        bindGenreHighlight();
        bindTrailerModal();
        if (window.__INITIAL_DATA__?.items?.length) {
            renderContent(window.__INITIAL_DATA__.items);
            setActiveGenre(window.__INITIAL_DATA__.currentGenre || "all");
        } else {
            fetchContent({ page: 1, genre: "all" });
        }
    }

    // =========================
    // Extra Pro-Mode Features
    // =========================
    async function dynamicLoadVideoModule() {
        const candidates = [
            "/js/videoPlayer.js",
            "/frontend/js/videoPlayer.js",
            "/videoPlayer.js",
        ];
        for (const p of candidates) {
            try {
                const mod = await import(p);
                console.debug("Loaded video module from", p);
                return mod;
            } catch {}
        }
        console.debug("Video module not found.");
        return null;
    }

    // Parallax scroll for hero
    window.addEventListener("scroll", () => {
        const hero = document.querySelector(".hero-background");
        if (hero) hero.classList.toggle("parallax", window.scrollY < 150);
    });

    // Fade-in sections
    document.addEventListener("DOMContentLoaded", () => {
        const sections = document.querySelectorAll(".fade-in-section");
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) entry.target.classList.add("visible");
            });
        }, { threshold: 0.2 });
        sections.forEach(sec => observer.observe(sec));
    });

    // =========================
    // Boot Logic
    // =========================
    (function boot() {
        const mode =
            ["movies", "tvshows"].includes(state.pageType) &&
            !window.__INITIAL_DATA__
                ? "SSR"
                : "HYBRID";
        mode === "SSR" ? enableSSRMode() : enableHybridMode();
    })();

    // Expose globals
    window.appState = state;
    window.appFetchContent = fetchContent;
    window.appRenderContent = renderContent;
    window.setActiveGenre = setActiveGenre;
    window.dynamicLoadVideoModule = dynamicLoadVideoModule;
}
document.addEventListener("DOMContentLoaded", () => {
    const loader = document.getElementById("ajax-loading");

    // ==============================
    // 🔹 Loader Control
    // ==============================
    const showLoader = (text = "Loading…") => {
        if (!loader) return;
        const textEl = loader.querySelector(".loader-text");
        if (textEl) textEl.innerHTML = text;
        loader.classList.add("active");
        loader.classList.remove("hidden");
        animateLoaderText();
    };

    const hideLoader = () => {
        if (!loader) return;
        loader.classList.remove("active");
        setTimeout(() => loader.classList.add("hidden"), 400);
    };

    // ==============================
    // 🔹 Smart Dynamic Loader Messages
    // ==============================
    document.querySelectorAll("a[href], form").forEach((el) => {
        if (el.tagName === "A") {
            el.addEventListener("click", (e) => {
                const href = el.getAttribute("href");
                if (!href || href.startsWith("#") || el.target) return;

                let message = "Loading...";
                let color = "#0d6efd";

                // Context detection
                if (href.includes("/shop")) {
                    if (href.includes("/category/")) {
                        const genre = decodeURIComponent(href.split("/category/")[1].split("?")[0]);
                        message = `🎬 Loading ${genre.replace(/-/g, " ")}...`;
                        color = getGenreColor(genre);
                    } else {
                        message = "🛍️ Loading shop...";
                        color = "#28a745";
                    }
                } else if (href.includes("/cart")) {
                    message = "🛒 Opening your cart...";
                    color = "#ffb400";
                } else if (href.includes("/checkout")) {
                    message = "💳 Preparing checkout...";
                    color = "#17a2b8";
                } else if (href.includes("/login")) {
                    message = "🔐 Loading login...";
                    color = "#6610f2";
                } else if (href.includes("/register")) {
                    message = "👤 Creating your account...";
                    color = "#6f42c1";
                } else if (href.includes("/tvshows")) {
                    message = "📺 Loading TV shows...";
                    color = "#007bff";
                } else if (href.includes("/movies")) {
                    message = "🎞️ Loading movies...";
                    color = "#dc3545";
                } else if (href.includes("/services")) {
                    message = "⚙️ Opening services...";
                    color = "#20c997";
                } else if (href.includes("/contact")) {
                    message = "📞 Opening contact page...";
                    color = "#ffc107";
                } else if (href === "/" || href === "/home") {
                    message = "🏠 Returning home...";
                    color = "#0dcaf0";
                }

                showLoader(`<span style="color:${color}">${message}</span>`);
            });
        } else if (el.tagName === "FORM") {
            el.addEventListener("submit", () => {
                const formAction = el.getAttribute("action") || "";
                if (formAction.includes("/cart/add"))
                    showLoader("🛒 Adding to cart...");
                else if (formAction.includes("/search"))
                    showLoader("🔎 Searching...");
                else
                    showLoader("Processing...");
            });
        }
    });

    // ==============================
    // 🔹 Inline Mini Loader (for fetch/search)
    // ==============================
    window.inlineLoader = {
        show(target, text = "Loading…") {
            if (!target) return;
            const mini = document.createElement("div");
            mini.className = "inline-loader";
            mini.innerHTML = `<div class="spinner-border spinner-border-sm text-light me-2"></div> ${text}`;
            mini.style.cssText =
                "display:inline-flex;align-items:center;gap:6px;font-size:0.9rem;color:#fff;background:rgba(0,0,0,0.5);padding:4px 10px;border-radius:8px;transition:opacity .3s ease;";
            target.insertAdjacentElement("afterend", mini);
            setTimeout(() => (mini.style.opacity = "1"), 10);
            return mini;
        },
        hide(mini) {
            if (!mini) return;
            mini.style.opacity = "0";
            setTimeout(() => mini.remove(), 300);
        },
    };

    // ==============================
    // 🔹 Hide loader after load
    // ==============================
    window.addEventListener("load", hideLoader);

    // ==============================
    // 🔹 Utility Functions
    // ==============================
    function getGenreColor(genre = "") {
        const g = genre.toLowerCase();
        if (g.includes("action")) return "#ff3b3b";
        if (g.includes("drama")) return "#007bff";
        if (g.includes("comedy")) return "#f0ad4e";
        if (g.includes("romance")) return "#e83e8c";
        if (g.includes("horror")) return "#6c757d";
        if (g.includes("sci") || g.includes("fantasy")) return "#20c997";
        if (g.includes("documentary")) return "#17a2b8";
        return "#0d6efd";
    }

    function animateLoaderText() {
        const el = loader?.querySelector(".loader-text");
        if (!el) return;
        el.style.opacity = "0";
        el.style.transition = "opacity 0.4s ease";
        requestAnimationFrame(() => (el.style.opacity = "1"));
    }
});


window.addEventListener("pageshow", () => {
    const loader = document.getElementById("ajax-loading");
    if (loader) loader.classList.remove("active");
    loader?.style.setProperty("pointer-events", "none");
});


    document.addEventListener("DOMContentLoaded", () => {
    const trailerModal = document.getElementById("trailerModal");

    if (trailerModal) {
    trailerModal.addEventListener("hidden.bs.modal", function () {
    // 1️⃣ Ensure video stops playing
    const iframe = trailerModal.querySelector("iframe");
    const video = trailerModal.querySelector("video");
    if (iframe) iframe.src = iframe.src; // reset iframe
    if (video) video.pause();

    // 2️⃣ Remove leftover backdrop manually (if any)
    const backdrop = document.querySelector(".modal-backdrop");
    if (backdrop) backdrop.remove();

    // 3️⃣ Re-enable scrolling
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";

    console.log("✅ Trailer modal closed and cleaned up");
});
}
});



