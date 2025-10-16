const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");



// utils/getRandomAds.js
const ads = [
    {
        id: 1,
        title: "New Movie Promo",
        imageSrc: "/ads/movie.jpg",
        videoSrc: "/ads/trailer.mp4",
        buttonLink: "https://example.com",
        meta: {
            name: "MoviePromo2025",
            duration: 15,
            loop: false,
            weight: 2,
        },
    },
    {
        id: 2,
        title: "Snack Ad",
        imageSrc: "/ads/snack.jpg",
        buttonLink: "https://snacks.com",
        meta: {
            name: "SnackBoost",
            duration: 8,
            loop: true,
            weight: 1,
        },
    },
];

function getRandomAds(count = 1) {
    const pool = ads.flatMap(ad => Array(ad.meta?.weight || 1).fill(ad));
    const shuffled = pool.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// --------------------------------------------
// Utility: make safe filenames
// --------------------------------------------
function slugifyFilename(filename, maxLen = 64) {
    const ext = path.extname(filename).toLowerCase();
    const name = path.basename(filename, ext)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")     // strip accents
        .replace(/[^a-z0-9]+/gi, "-")        // replace non-alnum
        .replace(/^-+|-+$/g, "")             // trim dashes
        .slice(0, maxLen);
    return (name || "file") + ext;
}

// --------------------------------------------
// Default config
// --------------------------------------------
const DEFAULTS = {
    adsDir: path.join(__dirname, "..", "public", "ads"),
    publicPrefix: "/ads/",
    themes: ["theme-gold", "theme-blue","theme-green","theme-purple","theme-red"],
    allowedExts: new Set([".jpg",".jpeg",".png",".webp",".gif",".mp4",".webm"]),
    cacheTTLms: 10_000,
    renameUnsafe: false,
    watch: true,
};

// --------------------------------------------
// Mime type helper
// --------------------------------------------
function mimeForExt(ext) {
    ext = ext.toLowerCase();
    if (ext === ".mp4") return "video/mp4";
    if (ext === ".webm") return "video/webm";
    if ([".jpg",".jpeg"].includes(ext)) return "image/jpeg";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    return "application/octet-stream";
}

// --------------------------------------------
// Optional: probe video duration with ffprobe
// --------------------------------------------
async function probeDuration(filePath) {
    return new Promise((resolve) => {
        execFile("ffprobe", [
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            filePath
        ], (err, stdout) => {
            if (err) return resolve(null); // ffprobe missing or error
            const val = parseFloat(stdout);
            if (isNaN(val)) return resolve(null);
            resolve(val);
        });
    });
}

// --------------------------------------------
// Main Provider Class
// --------------------------------------------
class AdProvider {
    constructor(opts = {}) {
        this.opts = { ...DEFAULTS, ...opts };
        if (!path.isAbsolute(this.opts.adsDir)) {
            this.opts.adsDir = path.resolve(process.cwd(), this.opts.adsDir);
        }
        this.cache = [];
        this.lastRefresh = 0;
        this.refreshInProgress = false;
        this.watchHandle = null;
    }

    async ensureAdsDir() {
        try {
            await fs.mkdir(this.opts.adsDir, { recursive: true });
        } catch {}
    }

    async safeRenameOrCopy(origName) {
        const { adsDir, renameUnsafe } = this.opts;
        const origPath = path.join(adsDir, origName);
        const safeName = slugifyFilename(origName);
        if (safeName === origName) return safeName;

        const targetPath = path.join(adsDir, safeName);

        if (fsSync.existsSync(targetPath)) {
            return safeName; // already there
        }

        if (!renameUnsafe) return safeName;

        try {
            await fs.rename(origPath, targetPath);
            return path.basename(targetPath);
        } catch {
            return safeName;
        }
    }

    async refreshCache(force = false) {
        if (this.refreshInProgress) return;
        const now = Date.now();
        if (!force && (now - this.lastRefresh) < this.opts.cacheTTLms) return;
        this.refreshInProgress = true;

        try {
            await this.ensureAdsDir();
            const entries = await fs.readdir(this.opts.adsDir);
            const files = [];
            for (const f of entries) {
                const ext = path.extname(f).toLowerCase();
                if (!this.opts.allowedExts.has(ext)) continue;
                const full = path.join(this.opts.adsDir, f);
                let stat;
                try { stat = await fs.stat(full); } catch { continue; }
                if (!stat.isFile()) continue;

                const safe = await this.safeRenameOrCopy(f);
                const url = path.posix.join(this.opts.publicPrefix, encodeURIComponent(safe));
                files.push({
                    name: f,
                    safeName: safe,
                    ext,
                    url,
                    mime: mimeForExt(ext),
                    size: stat.size,
                    mtime: stat.mtimeMs
                });
            }
            this.cache = files;
            this.lastRefresh = Date.now();
        } catch (err) {
            console.warn("AdProvider.refreshCache failed:", err.message);
        } finally {
            this.refreshInProgress = false;
        }
    }

    startWatching() {
        if (!this.opts.watch) return;
        if (this.watchHandle) return;
        try {
            this.watchHandle = fsSync.watch(this.opts.adsDir, { persistent: false }, () => {
                this.refreshCache(true).catch(()=>{});
            });
        } catch {
            this._watchTimer = setInterval(()=> this.refreshCache(true).catch(()=>{}), this.opts.cacheTTLms * 3);
        }
    }

    stopWatching() {
        if (this.watchHandle) {
            this.watchHandle.close();
            this.watchHandle = null;
        }
        if (this._watchTimer) {
            clearInterval(this._watchTimer);
            this._watchTimer = null;
        }
    }

    async getAllAds() {
        await this.refreshCache();
        return this.cache.slice();
    }

    async getRandomAd() {
        await this.refreshCache();
        const files = this.cache;
        if (!files || files.length === 0) return null;

        const pick = files[Math.floor(Math.random() * files.length)];
        const isVideo = [".mp4", ".webm"].includes(pick.ext);

        let duration = null;
        if (isVideo) {
            try {
                duration = await probeDuration(path.join(this.opts.adsDir, pick.safeName));
            } catch {
                duration = null;
            }
        }

        return {
            theme: this.opts.themes[Math.floor(Math.random() * this.opts.themes.length)],
            label: "Sponsored",
            title: "Frequency Promo 🎉",
            subtitle: "Contact us for Advertisement!",
            buttonText: "Learn More",
            buttonLink: "/coming-soon",
            linkText: null,
            linkHref: null,
            imageSrc: isVideo ? null : pick.url,
            imageAlt: isVideo ? null : pick.safeName,
            videoSrc: isVideo ? pick.url : null,
            videoPoster: isVideo ? null : null,
            meta: {
                name: pick.safeName,
                mime: pick.mime,
                size: pick.size,
                mtime: pick.mtime,
                duration // float seconds or null
            }
        };
    }
}

// --------------------------------------------
// Factory + Express Middleware
// --------------------------------------------
function createAdProvider(opts) {
    const p = new AdProvider(opts);
    p.refreshCache().catch(()=>{});
    if (p.opts.watch) p.startWatching();
    return p;
}

function expressAdMiddleware(provider, key = "ad") {
    return async (req, res, next) => {
        try {
            res.locals[key] = await provider.getRandomAd();
        } catch {
            res.locals[key] = null;
        }
        next();
    };
}

module.exports = { createAdProvider, expressAdMiddleware };
