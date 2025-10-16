// ============================
// Config
// ============================
const DEFAULT_CONFIG = {
    fadeDuration: 300,
    fadeStep: 0.1,
    observerThreshold: 0.5,
    analyticsEnabled: true,
    autoplay: true,
    loop: true,
    muted: true,
    preload: "metadata",
};

// ============================
// Init Video Players
// ============================
export function initVideoPlayers(config = {}) {
    const settings = { ...DEFAULT_CONFIG, ...config };
    const videos = document.querySelectorAll(".ad-video, .trailer-video");

    console.log(`[VideoPlayer] Found ${videos.length} videos to init`);

    videos.forEach(video => {
        const wrapper = video.closest(".video-wrapper, .ad-video-wrapper");
        if (!wrapper) return;

        const isAd = video.classList.contains("ad-video");
        const isTrailer = video.classList.contains("trailer-video");

        // Default setup
        video.muted = settings.muted;
        video.autoplay = settings.autoplay;
        video.loop = isAd; // ads loop, trailers don’t
        video.playsInline = true;
        video.preload = settings.preload;

        // Try autoplay
        video.play().then(() => {
            console.log(`[VideoPlayer] Autoplay success: ${video.src}`);
        }).catch(err => {
            console.warn(`[VideoPlayer] Autoplay failed, forcing muted play: ${video.src}`, err);
            video.muted = true;
            video.play().catch(e => console.error("[VideoPlayer] Video failed to play:", e));
        });

        // ======================
        // Sound toggle button
        // ======================
        let toggleBtn = wrapper.querySelector(".video-sound-toggle, .ad-sound-toggle");
        if (!toggleBtn) {
            toggleBtn = document.createElement("button");
            toggleBtn.className =
                "video-sound-toggle btn btn-sm btn-dark rounded-circle position-absolute bottom-0 end-0 m-2";
            toggleBtn.innerHTML = "🔇";
            toggleBtn.setAttribute("aria-label", "Toggle sound");
            toggleBtn.setAttribute("aria-pressed", "true");
            wrapper.appendChild(toggleBtn);
        }

        toggleBtn.addEventListener("click", e => {
            e.stopPropagation();
            video.muted = !video.muted;
            console.log(`[VideoPlayer] Toggle sound → muted=${video.muted} for ${video.src}`);
            updateToggleUI(toggleBtn, video.muted);
            if (!video.muted && video.volume === 0) {
                video.volume = 1; // ensure audible
            }
        });

        // ======================
        // Hover fade (trailers only)
        // ======================
        if (isTrailer) {
            wrapper.addEventListener("mouseenter", () => {
                console.log("[VideoPlayer] Hover enter → fade in audio");
                video.muted = false; // ensure unmuted before fading
                fadeVolume(video, 1, settings);
                updateToggleUI(toggleBtn, false);
            });
            wrapper.addEventListener("mouseleave", () => {
                console.log("[VideoPlayer] Hover leave → fade out audio");
                fadeVolume(video, 0, settings);
                updateToggleUI(toggleBtn, true);
            });
        }

        // ======================
        // Trailer → modal
        // ======================
        if (isTrailer) {
            wrapper.addEventListener("click", e => {
                if (e.target === toggleBtn) return;
                console.log("[VideoPlayer] Opening trailer modal for", video.src);
                openTrailerModal(
                    video.src,
                    video.getAttribute("aria-label") || "Trailer",
                    video.dataset.type || "video"
                );
            });
        }

        // ======================
        // Analytics hooks
        // ======================
        video.addEventListener("play", () => {
            console.log("[VideoPlayer] Event: play", video.src);
            fireEvent(wrapper, "video:play", { src: video.src });
        });

        video.addEventListener("timeupdate", throttle(() => {
            if (video.duration && video.currentTime >= video.duration / 2) {
                console.log("[VideoPlayer] Event: 50% played", video.src);
                fireEvent(wrapper, "video:50%", { src: video.src });
            }
        }, 1000));

        video.addEventListener("error", (e) => {
            console.error("[VideoPlayer] Video error:", video.src, e);
            wrapper.innerHTML =
                '<div class="alert alert-danger">Video failed to load</div>';
        });
    });

    // Offscreen pause/mute
    setupIntersectionObserver(videos, settings);
}

// ============================
// Smooth Fade Volume
// ============================
function fadeVolume(video, target, settings) {
    const step = settings.fadeStep;
    const interval = settings.fadeDuration / (1 / step);
    let vol = video.volume;
    const direction = target > vol ? 1 : -1;

    const fade = setInterval(() => {
        vol = +(vol + step * direction).toFixed(2);
        video.volume = Math.min(1, Math.max(0, vol));
        if ((direction > 0 && vol >= target) || (direction < 0 && vol <= target)) {
            clearInterval(fade);
            video.volume = target;
            video.muted = target === 0;
            console.log(`[VideoPlayer] Fade complete → volume=${video.volume}, muted=${video.muted}`);
        }
    }, interval);
}

// ============================
// Update Toggle UI
// ============================
function updateToggleUI(btn, isMuted) {
    btn.innerHTML = isMuted ? "🔇" : "🔊";
    btn.setAttribute("aria-pressed", isMuted ? "true" : "false");
}

// ============================
// Modal for Trailers
// ============================
function openTrailerModal(src, title, type = "video") {
    const modal = document.getElementById("trailerModal");
    if (!modal) {
        console.error("[VideoPlayer] No #trailerModal found in DOM!");
        return;
    }

    const container = modal.querySelector(".trailer-container");
    const modalTitle = modal.querySelector(".modal-title");

    container.innerHTML = "";
    modalTitle.textContent = title || "Watch Trailer";
    container.innerHTML = getTrailerEmbed(src, type);

    fireEvent(modal, "trailer:open", { src, type });

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    modal.addEventListener(
        "hidden.bs.modal",
        () => {
            const vid = container.querySelector("video");
            if (vid) {
                vid.pause();
                vid.src = ""; // ✅ ensure memory cleanup
            }
            container.innerHTML = "";
            fireEvent(modal, "trailer:close", { src });
        },
        { once: true }
    );
}

function getTrailerEmbed(src, type) {
    switch (type) {
        case "youtube":
            return `
                <iframe class="w-100 h-100"
                    src="${src}?autoplay=1&rel=0"
                    title="YouTube Trailer"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen>
                </iframe>`;
        case "vimeo":
            return `
                <iframe class="w-100 h-100"
                    src="${src}?autoplay=1"
                    title="Vimeo Trailer"
                    frameborder="0"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowfullscreen>
                </iframe>`;
        default:
            return `
                <video class="w-100 h-100" controls autoplay>
                    <source src="${src}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>`;
    }
}

// ============================
// Global Trailer Button Handler
// ============================
document.addEventListener("click", e => {
    const btn = e.target.closest(".trailer-play-btn");
    if (!btn) return;

    const src = btn.dataset.src;
    const type = btn.dataset.type || "video";
    const title = btn.dataset.title;

    console.log("[VideoPlayer] Global trailer button clicked", src);
    openTrailerModal(src, title, type);
});

// ============================
// Intersection Observer
// ============================
function setupIntersectionObserver(videos, settings) {
    let activeVideo = null;
    const observer = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                const video = entry.target;
                const wrapper = video.closest(".video-wrapper, .ad-video-wrapper");
                const toggleBtn = wrapper?.querySelector(".video-sound-toggle, .ad-sound-toggle");

                if (entry.isIntersecting) {
                    video.play().catch(err => console.warn("[VideoPlayer] Autoplay on intersect failed:", err));
                    activeVideo = video;
                } else {
                    video.pause();
                    video.muted = true;
                    if (toggleBtn) updateToggleUI(toggleBtn, true);
                    if (activeVideo === video) activeVideo = null;
                }
            });
        },
        { threshold: settings.observerThreshold }
    );

    videos.forEach(v => observer.observe(v));
}

// ============================
// Utility: Throttle
// ============================
function throttle(fn, limit) {
    let waiting = false;
    return (...args) => {
        if (!waiting) {
            fn(...args);
            waiting = true;
            setTimeout(() => (waiting = false), limit);
        }
    };
}

// ============================
// Utility: Analytics Event
// ============================
function fireEvent(el, name, detail = {}) {
    if (!DEFAULT_CONFIG.analyticsEnabled) return;
    el.dispatchEvent(new CustomEvent(name, { detail }));
}
