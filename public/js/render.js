import { state } from "./state.js";
import { safeTruncate, showSkeletons, clearSkeletons } from "./ui.js";
import { fetchContent } from "./network.js";

const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const vid = entry.target.querySelector("video");
        if (!vid) return;
        entry.isIntersecting ? vid.play().catch(()=>{}) : vid.pause();
    });
}, { threshold: 0.5 });

const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.src;
            if (src) {
                img.src = src;
                img.removeAttribute("data-src");
            }
            imageObserver.unobserve(img);
        }
    });
}, { rootMargin: "200px" });

function observePlayableElements(container=document) {
    container.querySelectorAll(".content-card, .ad-banner").forEach(el => videoObserver.observe(el));
    container.querySelectorAll("img[data-src]").forEach(img => imageObserver.observe(img));
}

export function renderContent(items, append=false) {
    const grid = document.getElementById(`${state.pageType}Grid`) || document.getElementById("contentGrid");
    if (!grid) return;

    if (!append) grid.innerHTML = "";

    if (!Array.isArray(items) || items.length === 0) {
        if (!append) {
            const p = document.createElement("p");
            p.className = "text-center text-muted mt-3";
            p.textContent = `No ${state.pageType} found.`;
            grid.appendChild(p);
        }
        return;
    }

    clearSkeletons();

    const frag = document.createDocumentFragment();

    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "content-card card bg-dark text-light shadow-lg border-neon mb-4";
        card.style.transition = "transform 0.3s ease, box-shadow 0.3s ease";
        card.onmouseenter = () => card.style.transform = "scale(1.03)";
        card.onmouseleave = () => card.style.transform = "scale(1)";

        const img = document.createElement("img");
        img.className = "poster-img card-img-top";
        img.dataset.src = item.poster_path || "/images/default.jpg";
        img.alt = item.title || item.name || "Poster";
        img.loading = "lazy";

        const body = document.createElement("div");
        body.className = "card-body";

        const title = document.createElement("h5");
        title.className = "movie-title card-title text-neon";
        title.textContent = item.title || item.name || "Untitled";

        const year = document.createElement("p");
        year.className = "movie-year text-muted mb-1 small";
        const release = item.release_date || item.first_air_date || "";
        year.textContent = release ? (release.split("-")[0] || "Unknown") : "Unknown";

        const overview = document.createElement("p");
        overview.className = "movie-overview small";
        overview.textContent = safeTruncate(item.overview, 120);

        if (item.trailer) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "trailer-btn btn btn-sm btn-outline-neon";
            btn.dataset.trailer = item.trailer;
            btn.setAttribute("data-bs-toggle", "modal");
            btn.setAttribute("data-bs-target", "#trailerModal");
            btn.textContent = "🎬 Trailer";
            body.appendChild(btn);
        }

        body.append(title, year, overview);
        card.append(img, body);
        frag.append(card);
    });

    grid.append(frag);
    observePlayableElements(grid);
}

// =====================================
// 🔁 Infinite Scroll + Prefetch Logic
// =====================================
let infiniteObserver;

export function initInfiniteScroll() {
    if (infiniteObserver) infiniteObserver.disconnect();

    const sentinel = document.querySelector("#infiniteScrollSentinel");
    if (!sentinel) return;

    infiniteObserver = new IntersectionObserver(async (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !state.isLoading && state.currentPage < state.totalPages) {
            showSkeletons(4);
            await fetchContent({
                page: state.currentPage + 1,
                genre: state.currentGenre,
                search: state.currentSearch
            }).then(() => clearSkeletons());
        }
    }, { rootMargin: "300px" });

    infiniteObserver.observe(sentinel);
}
