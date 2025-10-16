// backfillRuntimeSeasons.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import fetch from "node-fetch";
import TVShow from "./../Models/tvShowModel.js"; // adjust path if needed

dotenv.config();

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.TMDB_API_KEY;
const CONN_STR = process.env.CONN_STR || process.env.DATABASE_URL;

if (!TMDB_KEY) {
    console.error("❌ Missing TMDB_API_KEY in env. Set TMDB_API_KEY.");
    process.exit(1);
}
if (!CONN_STR) {
    console.error("❌ Missing CONN_STR (Mongo connection string) in env.");
    process.exit(1);
}

// Tunables (can also come from env)
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 10;
const BATCH_DELAY = parseInt(process.env.BATCH_DELAY, 10) || 1000; // ms
const RETRIES = parseInt(process.env.RETRIES, 10) || 3;

let updatedCount = 0;
let skippedCount = 0;
let failedCount = 0;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// fetch wrapper that retries and handles 429 (Retry-After) gracefully
async function fetchWithRetry(url, retries = RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url);

            if (res.ok) {
                return res.json();
            }

            // handle rate limit: try to honor Retry-After header if present
            if (res.status === 429) {
                const ra = res.headers.get?.("retry-after");
                const waitMs = ra ? parseInt(ra, 10) * 1000 : 2000 * attempt;
                console.warn(`⚠️ 429 received for ${url}. Waiting ${waitMs}ms (attempt ${attempt}).`);
                await sleep(waitMs);
                // continue to next attempt
            } else {
                // non-429 error: read body for logging and throw
                const body = await res.text();
                throw new Error(`HTTP ${res.status} - ${body}`);
            }
        } catch (err) {
            if (attempt === retries) throw err;
            const backoff = 500 * attempt;
            console.warn(`Retry ${attempt} failed for ${url}. Error: ${err.message}. Backing off ${backoff}ms.`);
            await sleep(backoff);
        }
    }
    // Should not reach here
    throw new Error(`Failed fetching ${url} after ${retries} attempts`);
}

async function fetchTVDetails(id) {
    const url = `${TMDB_BASE_URL}/tv/${id}?api_key=${TMDB_KEY}&language=en-US`;
    // debug log
    console.log(`Fetching TMDB details for tv id=${id} -> ${url}`);
    return fetchWithRetry(url);
}

async function backfillTVSeasons() {
    const query = { $or: [{ seasons: { $exists: false } }, { seasons: null },{ seasons: 7 }] };
    const shows = await TVShow.find(query).lean();
    console.log(`📺 Found ${shows.length} TV shows with missing seasons.`);

    for (let i = 0; i < shows.length; i += BATCH_SIZE) {
        const batch = shows.slice(i, i + BATCH_SIZE);

        // process batch in parallel
        await Promise.all(
            batch.map(async (doc) => {
                const docId = doc._id;
                const storedId = doc.id;
                const title = doc.title || doc.name || "(no title)";

                // numeric TMDB id check: sometimes id could be string — try to coerce
                const tmdbId = typeof storedId === "number" ? storedId
                    : (storedId && !Number.isNaN(Number(storedId)) ? Number(storedId) : null);

                if (!tmdbId) {
                    console.warn(`⚠️ Skipping "${title}" (_id: ${docId}) — invalid or missing TMDB id: ${storedId}`);
                    skippedCount++;
                    return;
                }

                try {
                    const details = await fetchTVDetails(tmdbId);

                    if (!details || typeof details.number_of_seasons !== "number") {
                        console.warn(`⚠️ TMDB returned no seasons for "${title}" (tmdb id: ${tmdbId}). Skipping.`);
                        skippedCount++;
                        return;
                    }

                    // update seasons only, skip validators
                    await TVShow.findByIdAndUpdate(
                        docId,
                        { $set: { seasons: details.number_of_seasons } },
                        { runValidators: false }
                    );

                    console.log(`✅ Updated "${title}" (tmdb id: ${tmdbId}) → seasons: ${details.number_of_seasons}`);
                    updatedCount++;
                } catch (err) {
                    console.error(
                        `❌ Failed to update "${title}" (tmdb id: ${tmdbId}) — _id: ${docId} — error: ${err.message}`
                    );
                    failedCount++;
                }
            })
        );

        // wait between batches to avoid bursts (TMDB rate limiting)
        await sleep(BATCH_DELAY);
        console.log(`--- processed ${Math.min(i + BATCH_SIZE, shows.length)} / ${shows.length} ---`);
    }

    console.log("\n📊 Backfill summary:");
    console.log(`   ✅ Updated: ${updatedCount}`);
    console.log(`   ⚠️ Skipped: ${skippedCount}`);
    console.log(`   ❌ Failed:  ${failedCount}`);
}

async function run() {
    try {
        await mongoose.connect(CONN_STR);
        console.log("✅ MongoDB connected");

        await backfillTVSeasons();
    } catch (err) {
        console.error("Fatal error:", err);
    } finally {
        await mongoose.disconnect();
        console.log("🛑 Disconnected from MongoDB");
    }
}


run();
