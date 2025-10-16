// utils/getResponsivePaths.js
function getResponsivePaths(imagePath, options = {}) {
    const config = {
        fallback: "/images/default.jpg",
        cdnPrefix: "",           // e.g. "https://cdn.mysite.com"
        debug: false,
        ...options,
    };

    // Ensure prefix has no trailing slash
    if (config.cdnPrefix.endsWith("/")) {
        config.cdnPrefix = config.cdnPrefix.slice(0, -1);
    }

    // STEP 1: Validate input
    if (!imagePath || typeof imagePath !== "string") {
        return buildFallback(config);
    }

    // STEP 2: Normalize slashes and prefix
    let url = imagePath.trim().replace(/\\/g, "/");
    if (!url.startsWith("/") && !/^https?:\/\//i.test(url)) {
        url = "/" + url;
    }

    // Always return the original path only
    const finalUrl = config.cdnPrefix + url;

    return {
        srcFallback: finalUrl,
        srcMedium: finalUrl,
        srcLarge: finalUrl,
        // imageWebp: ""   // skip WebP for now
    };
}

// 🔹 Helper for missing/invalid inputs
function buildFallback(config) {
    const fallback = config.cdnPrefix + config.fallback;
    return {
        srcFallback: fallback,
        srcMedium: fallback,
        srcLarge: fallback,
    };
}

module.exports = getResponsivePaths;
