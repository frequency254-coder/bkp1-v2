import { state } from "./state.js";
import { fetchContent } from "./network.js";
import { applyRandomThemes } from "./ui.js";
import { initSearch } from "./search.js";
import { rotateAds } from "./ads.js";
// frontend/js/main.js
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "../css/style.css"; // your custom styles

const adsController = rotateAds(); // options optional
// later: adsController.refreshNow(), adsController.stop();


document.addEventListener("DOMContentLoaded", () => {
    applyRandomThemes();
    initSearch();
    rotateAds();

    const params = new URLSearchParams(location.search);
    fetchContent({
        page: parseInt(params.get("page")) || 1,
        genre: params.get("genre") || "all",
        search: params.get("search") || ""
    });
});

document.addEventListener("DOMContentLoaded", () => {
    // ...
    const rot = rotateAds({
        api: "/api/v1/ad",
        defaultInterval: 30_000,
        onError: (e) => console.warn("Ad rotation problem", e)
    });

    // optional: stop later
    // rot.stop();
});
document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".ad-sound-toggle");
    if (!toggle) return;

    const wrapper = toggle.closest(".ad-video-wrapper");
    const video = wrapper?.querySelector("video");
    if (!video) return;

    if (video.muted) {
        video.muted = false;
        toggle.dataset.muted = "false";
        toggle.textContent = "🔊";
        toggle.setAttribute("aria-label", "Mute advertisement");
    } else {
        video.muted = true;
        toggle.dataset.muted = "true";
        toggle.textContent = "🔇";
        toggle.setAttribute("aria-label", "Unmute advertisement");
    }
});

// Auto-mute when video goes out of view
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const video = entry.target.querySelector("video");
        const toggle = entry.target.querySelector(".ad-sound-toggle");
        if (!video) return;
        if (!entry.isIntersecting) {
            video.muted = true;
            if (toggle) {
                toggle.dataset.muted = "true";
                toggle.textContent = "🔇";
            }
        }
    });
}, { threshold: 0.25 });

document.querySelectorAll(".ad-video-wrapper").forEach(wrapper => {
    observer.observe(wrapper);
});

