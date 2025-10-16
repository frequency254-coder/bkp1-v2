import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

dotenv.config({ path: path.resolve("./.env") });

const API_KEY = process.env.TMDB_API_KEY;
const MONGO_URI = process.env.CONN_STR;
const TOTAL_MOVIES = 10000;
const MOVIES_PER_PAGE = 20;
const DELAY_MS = 350;
const MAX_CONCURRENT_DOWNLOADS = 5;
const IMAGES_DIR = path.join(process.cwd(), "public", "images");
const START_PAGE = 1;

// Ensure images folder exists
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// Mongoose schema
const movieSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    title: String,
    overview: String,
    release_date: String,
    genres: [String],
    poster_path: String,
    duration: Number,
    trailer: String,
});
const Movie = mongoose.model("Movie", movieSchema);

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Download poster
async function downloadPoster(url, movieId) {
    try {
        const res = await fetch(url);
        if (!res.ok) return "/images/default.jpg";
        const buffer = await res.arrayBuffer();
        const filename = `${movieId}.jpg`;
        const filePath = path.join(IMAGES_DIR, filename);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        return `/images/${filename}`;
    } catch (err) {
        console.error(`Error downloading poster ${movieId}: ${err}`);
        return "/images/default.jpg";
    }
}

// Retry wrapper
async function fetchWithRetry(url, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url);
            if (res.ok) return res.json();
            if (res.status === 429) {
                const wait = (res.headers.get("retry-after") || 2) * 1000;
                console.warn(`429 Rate limit. Waiting ${wait}ms`);
                await sleep(wait);
            } else {
                throw new Error(`HTTP ${res.status} - ${await res.text()}`);
            }
        } catch (err) {
            if (attempt === retries) throw err;
            await sleep(500 * attempt);
            console.warn(`Retry ${attempt} failed: ${err.message}`);
        }
    }
}

// Fetch genre map
async function getGenreMap() {
    const data = await fetchWithRetry(
        `https://api.themoviedb.org/3/genre/movie/list?api_key=${API_KEY}`
    );
    const map = {};
    (data.genres || []).forEach((g) => (map[g.id] = g.name));
    return map;
}

// Fetch movie details (runtime + poster path)
async function fetchMovieDetails(movieId) {
    return fetchWithRetry(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${API_KEY}`);
}

// Fetch trailer
async function fetchTrailer(movieId) {
    try {
        const data = await fetchWithRetry(
            `https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${API_KEY}`
        );
        const trailer = (data.results || []).find(
            (v) => v.type === "Trailer" && v.site === "YouTube"
        );
        return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
    } catch {
        return null;
    }
}

// Main fetch & store function
async function fetchAndStoreMovies() {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const genreMap = await getGenreMap();
    const totalPages = Math.ceil(TOTAL_MOVIES / MOVIES_PER_PAGE);

    for (let page = START_PAGE; page <= totalPages; page++) {
        console.log(`📥 Fetching page ${page} of ${totalPages}...`);
        const data = await fetchWithRetry(
            `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&page=${page}`
        );

        const downloadQueue = [];

        for (const movie of data.results || []) {
            if (!movie.id || !movie.title) continue;

            // Skip if already has duration
            const existing = await Movie.findOne({ id: movie.id });
            if (existing && existing.duration) continue;

            const genres = (movie.genre_ids || []).map((id) => genreMap[id]).filter(Boolean);

            // Fetch full details
            const details = await fetchMovieDetails(movie.id);
            const duration = details.runtime || null;
            const posterPath = details.poster_path || null;

            // Download poster
            let localPoster = "/images/default.jpg";
            if (posterPath) {
                const url = `https://image.tmdb.org/t/p/w500${posterPath}`;
                downloadQueue.push(
                    (async () => {
                        localPoster = await downloadPoster(url, movie.id);
                    })()
                );
            }

            // Fetch trailer
            const trailer = await fetchTrailer(movie.id);

            // Upsert movie
            await Movie.updateOne(
                { id: movie.id },
                {
                    $set: {
                        id: movie.id,
                        title: movie.title,
                        overview: movie.overview,
                        release_date: movie.release_date,
                        genres,
                        poster_path: localPoster,
                        duration,
                        trailer,
                    },
                },
                { upsert: true, runValidators: false }
            );
        }

        // Wait for poster downloads
        while (downloadQueue.length > 0) {
            const batch = downloadQueue.splice(0, MAX_CONCURRENT_DOWNLOADS);
            await Promise.all(batch);
        }

        await sleep(DELAY_MS);
    }

    console.log("✅ Movie fetch complete");
    await mongoose.disconnect();
    console.log("🛑 MongoDB disconnected");
}

fetchAndStoreMovies();
