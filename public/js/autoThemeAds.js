/**
 * autoThemeAds.js — Cinematic Neon Auto-Theme System
 * Scans all .ad-card elements and auto-applies a color theme
 * based on content, metadata, or image tones.
 */

(function () {
    "use strict";

    const THEME_COLORS = {
        blue: "#00bfff",
        gold: "#ffb300",
        red: "#ff0055",
        green: "#00ff99",
        purple: "#9b5de5",
    };

    /** Helper: Guess theme from keywords or metadata */
    function guessThemeFromText(text = "") {
        const t = text.toLowerCase();
        if (/tech|digital|stream|app|cloud|smart|ai|future/.test(t)) return "blue";
        if (/vip|luxury|gold|premium|exclusive|cinema/.test(t)) return "gold";
        if (/action|fight|war|power|intense|danger/.test(t)) return "red";
        if (/eco|green|energy|game|play|nature/.test(t)) return "green";
        if (/music|beat|vibe|style|fashion/.test(t)) return "purple";
        return "blue"; // default
    }

    /** Helper: Extract approximate color from image (fast + safe) */
    async function getDominantColor(imgSrc) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = imgSrc;
            img.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    canvas.width = 1;
                    canvas.height = 1;
                    ctx.drawImage(img, 0, 0, 1, 1);
                    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                    resolve(`rgb(${r},${g},${b})`);
                } catch {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
        });
    }

    /** Main function */
    async function applyAdThemes() {
        const ads = document.querySelectorAll(".ad-card");
        for (const ad of ads) {
            const title = ad.querySelector("h5")?.textContent || "";
            const subtitle = ad.querySelector("p")?.textContent || "";
            const imgSrc = ad.querySelector("img")?.src;
            const text = `${title} ${subtitle}`;
            const guessed = guessThemeFromText(text);

            // Try extracting color from image for more accuracy
            let dominantColor = null;
            if (imgSrc) dominantColor = await getDominantColor(imgSrc);

            const finalColor = dominantColor || THEME_COLORS[guessed];

            ad.style.setProperty("--accent-glow", finalColor);
            ad.classList.add(guessed);
            ad.classList.add("neon-active");

            // Add a subtle animated border effect
            ad.style.boxShadow = `0 0 25px ${finalColor}55, 0 0 45px ${finalColor}33`;
        }
    }

    // Run when DOM is ready
    if (document.readyState !== "loading") {
        applyAdThemes();
    } else {
        document.addEventListener("DOMContentLoaded", applyAdThemes);
    }
})();
