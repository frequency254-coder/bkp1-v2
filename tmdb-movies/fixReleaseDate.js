import mongoose from "mongoose";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const TVShow = mongoose.model(
    "TVShow",
    new mongoose.Schema({
        id: Number,        // TMDB ID
        title: String,
        release_date: String,
        releaseYear: Number
    })
);

const TMDB_API_KEY = process.env.TMDB_API_KEY;

(async () => {
    try {
        await mongoose.connect(process.env.CONN_STR);
        console.log("✅ Connected to MongoDB");

        // Find TV shows with missing release_date or releaseYear
        const missingShows = await TVShow.find({
            $or: [
                { release_date: "" },
                { release_date: null },
                { release_date: { $exists: false } },
                { releaseYear: null },
                { releaseYear: { $exists: false } }
            ]
        });

        console.log(`📺 Found ${missingShows.length} TV shows with missing release info`);

        for (const show of missingShows) {
            try {
                const url = `https://api.themoviedb.org/3/tv/${show.id}?api_key=${TMDB_API_KEY}`;
                const res = await axios.get(url);

                if (res.data.first_air_date) {
                    const date = res.data.first_air_date;
                    const year = parseInt(date.split("-")[0]);

                    show.release_date = date;
                    show.releaseYear = year;
                    await show.save();

                    console.log(`✅ Updated: ${show.title} → ${date} (${year})`);
                } else {
                    console.warn(`⚠️ No air date from TMDB: ${show.title} (${show.id})`);
                }

                // small delay to avoid rate limits
                await new Promise(r => setTimeout(r, 400));
            } catch (err) {
                console.error(`❌ Failed for ${show.title} (${show.id}):`, err.message);
            }
        }

        console.log("🏁 Done updating TV shows.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Script failed:", err.message);
        process.exit(1);
    }
})();
