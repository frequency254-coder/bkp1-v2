import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import fetch from "node-fetch"; // only if Node < 18
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

// --- Config ---
const API_KEY = process.env.TMDB_API_KEY;
const MONGO_URI = process.env.CONN_STR;
const TOTAL_SHOWS = 10000;          // Total TV shows to fetch
const SHOWS_PER_PAGE = 20;         // TMDB page size
const DELAY_MS = 350;              // Delay between requests
const MAX_CONCURRENT_DOWNLOADS = 5;
const IMAGES_DIR = path.join(process.cwd(), "public", "images");

// --- Validate env ---
if (!API_KEY || !MONGO_URI) {
    console.error("❌ Missing TMDB_API_KEY or CONN_STR in .env");
    process.exit(1);
}

// --- Ensure images folder exists ---
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// --- TV Show Schema ---
const tvShowSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    title: String,
    overview: String,
    first_air_date: String,
    genres: [String],
    poster_path: String, // points to /images/id.jpg
    trailer: String,
});

const TvShow = mongoose.model("TvShow", tvShowSchema);

// --- Helpers ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadPoster(url, filename) {
    try {
        const res = await fetch(url);
        if (!res.ok) return console.error(`❌ Failed to download poster for ${filename}`);
        const buffer = await res.arrayBuffer();
        const filePath = path.join(IMAGES_DIR, `${filename}.jpg`);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        console.log(`✅ Poster saved: ${filename}.jpg`);
    } catch (err) {
        console.error(`❌ Error downloading poster ${filename}: ${err}`);
    }
}

async function getGenreMap() {
    const res = await fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${API_KEY}`);
    const data = await res.json();
    const map = {};
    (data.genres || []).forEach(g => (map[g.id] = g.name));
    return map;
}

async function getLastPage() {
    const count = await TvShow.countDocuments();
    return Math.floor(count / SHOWS_PER_PAGE) + 1;
}

// --- Fetch & Store TV Shows ---
async function fetchAndStoreTvShows() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB Atlas");

        const genreMap = await getGenreMap();
        const totalPages = Math.ceil(TOTAL_SHOWS / SHOWS_PER_PAGE);
        let showsFetched = 0;

        const startPage = await getLastPage();
        console.log(`➡️ Resuming TV shows from page ${startPage}/${totalPages}`);

        for (let page = startPage; page <= totalPages; page++) {
            console.log(`📄 Fetching TV Shows Page ${page}`);
            const res = await fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&page=${page}`);
            const data = await res.json();
            if (!data.results) continue;

            const downloadQueue = [];

            for (const s of data.results) {
                if (!s.name || !s.id) continue;

                const genres = (s.genre_ids || []).map(id => genreMap[id]).filter(Boolean);

                let trailerUrl = null;
                try {
                    const trailerRes = await fetch(`https://api.themoviedb.org/3/tv/${s.id}/videos?api_key=${API_KEY}`);
                    const trailerData = await trailerRes.json();
                    const trailer = trailerData.results.find(v => v.type === "Trailer" && v.site === "YouTube");
                    if (trailer) trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
                } catch {}

                const tvData = {
                    id: s.id,
                    title: s.name,
                    overview: s.overview,
                    first_air_date: s.first_air_date,
                    genres,
                    poster_path: s.poster_path ? `/images/${s.id}.jpg` : null,
                    trailer: trailerUrl,
                };

                await TvShow.updateOne({ id: s.id }, tvData, { upsert: true });
                showsFetched++;

                if (s.poster_path) {
                    const fullUrl = `https://image.tmdb.org/t/p/original${s.poster_path}`;
                    downloadQueue.push(downloadPoster(fullUrl, s.id));
                }
            }

            // Handle concurrent downloads
            while (downloadQueue.length > 0) {
                const batch = downloadQueue.splice(0, MAX_CONCURRENT_DOWNLOADS);
                await Promise.all(batch);
            }

            await sleep(DELAY_MS);
        }

        console.log(`✅ TV Shows fetched: ${showsFetched}`);
        await mongoose.connection.close();
        console.log("✅ MongoDB connection closed");
    } catch (err) {
        console.error(err);
    }
}

// --- Run ---
fetchAndStoreTvShows();
