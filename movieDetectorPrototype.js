// movieDetectorPrototype.js
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const vision = require("@google-cloud/vision");
const axios = require("axios");

const client = new vision.ImageAnnotatorClient(); // requires GOOGLE_APPLICATION_CREDENTIALS
const ACOUSTID_KEY = process.env.ACOUSTID_KEY || null;

const videoPath = process.argv[2];
if (!videoPath) {
    console.error("Usage: node movieDetectorPrototype.js <video.mp4>");
    process.exit(1);
}

const TMP = path.join(__dirname, "tmp_movie_detect");
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
const FRAMES_DIR = path.join(TMP, "frames");
if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });
const AUDIO_PATH = path.join(TMP, "audio.wav");

// Utility sleep
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1) extract frames (1 fps)
function extractFrames(video, outDir) {
    return new Promise((resolve, reject) => {
        ffmpeg(video)
            .outputOptions("-vf", "fps=1") // 1 frame/sec
            .output(path.join(outDir, "frame_%03d.jpg"))
            .on("end", () => resolve())
            .on("error", err => reject(err))
            .run();
    });
}

// 2) extract audio to WAV (fpcalc expects a file it can read)
function extractAudio(video, outPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(video)
            .noVideo()
            .audioCodec("pcm_s16le")
            .audioChannels(2)
            .audioFrequency(44100)
            .format("wav")
            .save(outPath)
            .on("end", () => resolve())
            .on("error", err => reject(err));
    });
}

// 3) analyze frames via Google Vision webDetection
async function analyzeFramesWithVision(framesDir) {
    const files = fs.readdirSync(framesDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    const counts = {};
    for (const f of files) {
        const p = path.join(framesDir, f);
        try {
            const [result] = await client.webDetection(p);
            const w = result.webDetection || {};
            const best = (w.bestGuessLabels && w.bestGuessLabels[0] && w.bestGuessLabels[0].label) || null;
            if (best) {
                counts[best] = (counts[best] || 0) + 1;
                console.log(`Vision: ${f} -> ${best}`);
            } else {
                // also try pagesWithMatchingImages labels
                if (w.pagesWithMatchingImages && w.pagesWithMatchingImages.length) {
                    const url = w.pagesWithMatchingImages[0].url;
                    counts[url] = (counts[url] || 0) + 1;
                    console.log(`Vision: ${f} -> (page) ${url}`);
                } else {
                    console.log(`Vision: ${f} -> (no guess)`);
                }
            }
        } catch (err) {
            console.warn("Vision error:", err.message);
        }
        await sleep(500); // gentle pacing for API quotas
    }
    return counts;
}

// 4) run fpcalc on audio to get fingerprint+duration
function runFpcalc(audioPath) {
    return new Promise((resolve, reject) => {
        execFile("fpcalc", [audioPath], (err, stdout, stderr) => {
            if (err) return reject(err);
            // parse lines like:
            // FILE=...
            // DURATION=32
            // FINGERPRINT=ABCD...
            const lines = stdout.split(/\r?\n/);
            let duration = null;
            let fingerprint = null;
            for (const L of lines) {
                if (L.startsWith("DURATION=")) duration = Number(L.split("=")[1]);
                if (L.startsWith("FINGERPRINT=")) fingerprint = L.split("=")[1];
            }
            if (!fingerprint || !duration) return reject(new Error("fpcalc returned no fingerprint/duration"));
            resolve({ fingerprint, duration });
        });
    });
}

// 5) lookup via AcoustID (optional)
async function acoustidLookup(fp, dur, apiKey) {
    if (!apiKey) return null;
    try {
        const res = await axios.get("https://api.acoustid.org/v2/lookup", {
            params: {
                client: apiKey,
                fingerprint: fp,
                duration: dur,
                meta: "recordings+releasegroups+tracks",
            },
            timeout: 20000,
        });
        if (!res.data || res.data.status !== "ok") return null;
        const titles = [];
        (res.data.results || []).forEach(r => {
            (r.recordings || []).forEach(rec => {
                if (rec.title) titles.push(rec.title);
                (rec.releasegroups || []).forEach(rg => rg.title && titles.push(rg.title));
            });
        });
        return titles;
    } catch (err) {
        console.warn("AcoustID lookup error:", err.message);
        return null;
    }
}

// Aggregate and print
function printAggregate(visionCounts, acoustidTitles) {
    console.log("\n=== Aggregated Vision guesses ===");
    const visionEntries = Object.entries(visionCounts).sort((a,b)=>b[1]-a[1]);
    visionEntries.forEach(([k,v]) => console.log(`${v} × ${k}`));
    if (acoustidTitles && acoustidTitles.length) {
        console.log("\n=== AcoustID Titles ===");
        const byCount = acoustidTitles.reduce((acc,t)=> { acc[t]=(acc[t]||0)+1; return acc; }, {});
        Object.entries(byCount).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`${v} × ${k}`));
    } else {
        console.log("\n(no AcoustID results)");
    }

    // simple decision logic
    const bestVision = visionEntries[0] ? visionEntries[0][0] : null;
    const bestAc = acoustidTitles && acoustidTitles.length ? acoustidTitles[0] : null;
    console.log("\n=== Final suggestion ===");
    if (bestVision && bestAc && bestVision.toLowerCase().includes(bestAc.split(" ")[0].toLowerCase())) {
        console.log(`High confidence: ${bestVision} (vision) + ${bestAc} (audio)`);
    } else if (bestVision) {
        console.log(`Likely (vision): ${bestVision}`);
    } else if (bestAc) {
        console.log(`Likely (audio): ${bestAc}`);
    } else {
        console.log("No confident match found.");
    }
}

// Main run
(async () => {
    try {
        console.log("Extracting frames...");
        await extractFrames(videoPath, FRAMES_DIR);
        console.log("Extracting audio...");
        await extractAudio(videoPath, AUDIO_PATH);

        let visionCounts = {};
        try {
            visionCounts = await analyzeFramesWithVision(FRAMES_DIR);
        } catch (e) {
            console.warn("Vision analysis failed:", e.message);
        }

        let acoustidTitles = null;
        try {
            const { fingerprint, duration } = await runFpcalc(AUDIO_PATH);
            console.log("Audio fingerprinted. duration:", duration);
            if (ACOUSTID_KEY) {
                acoustidTitles = await acoustidLookup(fingerprint, duration, ACOUSTID_KEY);
            } else {
                console.log("ACOUSTID_KEY not set. Skipping AcoustID lookup.");
            }
        } catch (err) {
            console.warn("Audio fingerprinting failed:", err.message);
        }

        printAggregate(visionCounts, acoustidTitles);

    } catch (err) {
        console.error("Fatal error:", err);
    } finally {
        console.log("\nDone. (temp files left in tmp_movie_detect/ for inspection)");
    }
})();
