// frontend/utils/themePicker.js
// =====================================================
// SMART THEME SYSTEM — perfectly aligned with your CSS
// Theme keys: theme-gold, theme-purple, theme-blue, theme-red, theme-green, theme-dark
// =====================================================

const themes = [
    { name: "theme-gold", tone: "warm" },
    { name: "theme-purple", tone: "vibrant" },
    { name: "theme-blue", tone: "cool" },
    { name: "theme-red", tone: "intense" },
    { name: "theme-green", tone: "fresh" },
    { name: "theme-dark", tone: "noir" },
];

// Time-based automatic selector
function pickByTime() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 11) return "theme-green";   // early — fresh & natural
    if (hour >= 11 && hour < 17) return "theme-gold";   // midday — warm & cinematic
    if (hour >= 17 && hour < 21) return "theme-purple"; // evening — electric neon
    return "theme-dark";                                // night — deep noir
}

// Core theme applier
export function applySmartTheme(forced = null) {
    const saved = localStorage.getItem("selectedTheme");
    const themeName = forced || saved || pickByTime();

    const theme = themes.find(t => t.name === themeName) || themes[0];

    // Smooth fade transition
    document.documentElement.style.transition =
        "background-color 0.6s ease, color 0.6s ease";
    document.documentElement.setAttribute("data-theme", theme.name);

    // Store preference
    localStorage.setItem("selectedTheme", theme.name);

    // Apply accent pulses consistently
    document.querySelectorAll(".pulse-glow").forEach(el => {
        el.classList.remove(...themes.map(t => t.name));
        el.classList.add(theme.name);
    });

    console.log(`🎨 Theme active: ${theme.name} (${theme.tone})`);
}

// User toggle — for manual theme cycling
export function cycleTheme() {
    const current = localStorage.getItem("selectedTheme");
    const idx = themes.findIndex(t => t.name === current);
    const next = themes[(idx + 1) % themes.length];
    applySmartTheme(next.name);
}
setInterval(() => {
    applySmartTheme(); // auto-refresh theme every few hours
}, 1000 * 60 * 60 * 3); // every 3 hours


// Initialize automatically
document.addEventListener("DOMContentLoaded", () => applySmartTheme());
