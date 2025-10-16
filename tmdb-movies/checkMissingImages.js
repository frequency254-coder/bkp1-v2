// fixGenres.js
import mongoose from "mongoose";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();



// Define schema
const TvShow = mongoose.model("TvShow", new mongoose.Schema({
    tmdbId: Number,
    title: String,
    genres: [String],
}));



const TMDB_API_KEY = process.env.TMDB_API_KEY;

(async () => {
    try {
        await mongoose.connect(process.env.CONN_STR);
        console.log("✅ Connected to MongoDB");

        // Find only shows with empty genres array
        const missingGenres = await TvShow.find({ genres: { $size: 0 } });
        console.log(`🎬 Found ${missingGenres.length} TV shows with empty genres`);

        for (const show of missingGenres) {
            if (!show.tmdbId) {
                console.warn(`⚠️ Skipping "${show.title}" (no tmdbId)`);
                continue;
            }

            try {
                const url = `https://api.themoviedb.org/3/tv/${show.tmdbId}?api_key=${TMDB_API_KEY}`;
                const res = await axios.get(url);

                if (res.data.genres && res.data.genres.length > 0) {
                    // Extract names
                    let genreNames = res.data.genres.map(g => g.name);

                    // Split "Action & Adventure" into two
                    if (genreNames.includes("Action & Adventure")) {
                        genreNames = genreNames.filter(g => g !== "Action & Adventure");
                        genreNames.push("Action", "Adventure");
                    }

                    show.genres = [...new Set(genreNames)]; // remove duplicates
                    await show.save();

                    console.log(`✅ Updated "${show.title}" → [${show.genres.join(", ")}]`);
                } else {
                    console.warn(`⚠️ No genres from TMDB: "${show.title}" (${show.tmdbId})`);
                }

                // small delay to avoid TMDB rate limits
                await new Promise(r => setTimeout(r, 400));
            } catch (err) {
                console.error(`❌ Failed for "${show.title}" (${show.tmdbId}):`, err.message);
            }
        }

        console.log("🏁 Done updating genres.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Script failed:", err.message);
        process.exit(1);
    }
})();
