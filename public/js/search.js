// ==========================================
// search.js — Frequency ENT v4.2 Ultimate
// Auto-Narrow Smart Search + No-Results Cinematic Feedback
// ==========================================

import { state } from "./state.js";
import { buildUrl, fetchContent } from "./network.js";
import { renderContent } from "./render.js";

export function initSearch() {
    const input =
        document.getElementById("searchInput") ||
        document.querySelector("input[name='search']");
    if (!input || input.dataset.bound === "true") return;

    input.dataset.bound = "true";
    let timer = null;
    let activeRequest = null;
    const delay = 350;

    // Create no-results element once
    const noResultsEl = document.createElement("div");
    noResultsEl.className = "no-results text-center fade-in";
    noResultsEl.innerHTML = `
    <div class="py-5 text-muted">
      <i class="fas fa-search fa-3x mb-3 opacity-50"></i>
      <h5>No Results Found</h5>
      <p class="small">Try different keywords or clear the search box.</p>
    </div>
  `;
    noResultsEl.style.display = "none";
    document.body.appendChild(noResultsEl);

    // Position near content grid (optional)
    const grid = document.querySelector("#contentGrid") || document.body;

    const showNoResults = () => {
        if (!noResultsEl.parentElement) document.body.appendChild(noResultsEl);
        noResultsEl.style.display = "block";
        grid.classList.add("blurred");
    };

    const hideNoResults = () => {
        noResultsEl.style.display = "none";
        grid.classList.remove("blurred");
    };

    // --- Add subtle cinematic glow ---
    input.addEventListener("focus", () => input.classList.add("search-glow"));
    input.addEventListener("blur", () => input.classList.remove("search-glow"));

    // --- Live auto-narrow search ---
    const runSearch = async () => {
        const query = input.value.trim();
        state.currentSearch = query;

        // Cancel previous request
        if (activeRequest?.abort) activeRequest.abort();
        activeRequest = new AbortController();

        const url = buildUrl(1, state.currentGenre, query);
        history.replaceState({}, "", url);

        input.classList.add("searching");

        try {
            const data = await fetchContent({
                page: 1,
                genre: state.currentGenre,
                search: query,
                signal: activeRequest.signal,
            });

            if (Array.isArray(data?.items)) {
                renderContent(data.items);
                if (data.items.length === 0 && query.length > 1) {
                    showNoResults();
                } else {
                    hideNoResults();
                }
            }
        } catch (err) {
            if (err.name !== "AbortError") console.error("Search failed:", err);
        } finally {
            input.classList.remove("searching");
        }
    };

    // --- Debounced input ---
    input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(runSearch, delay);
    });

    // --- Enter key triggers immediate search ---
    input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        clearTimeout(timer);
        runSearch();
    });

    console.log("✅ initSearch() ready — Smart Auto-Narrow + Cinematic Mode");
}
