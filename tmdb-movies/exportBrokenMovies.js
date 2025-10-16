// fixPosterPaths.mjs
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// ===== Import your models =====
import Movie from "./../Models/movieModel.js";
import TvShow from "./../Models/tvShowModel.js";

const MONGO_URI = process.env.CONN_STR;

// ===== Setup log folder =====
const logDir = path.resolve("./log");
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}
const logFile = path.join(logDir, "poster_replacements.txt");

// ===== Helper: log to file =====
function logMessage(msg) {
    fs.appendFileSync(logFile, msg + "\n", "utf8");
}

async function fixPosterPaths() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to DB");

        // Movies
        const movies = await Movie.find({});
        let movieFixes = 0;

        for (const movie of movies) {
            if (typeof movie.poster_path === "string" && movie.poster_path.startsWith("/")) {
                if (movie.coverImage) {
                    await Movie.updateOne(
                        { _id: movie._id },
                        { $set: { poster_path: movie.coverImage }, $unset: { coverImage: "" } }
                    );
                    movieFixes++;
                    logMessage(`Movie: ${movie.title} → poster_path replaced with ${movie.coverImage}`);
                }
            }
        }

        console.log(`🎬 Fixed ${movieFixes} movie poster paths`);

        // TV Shows
        const tvShows = await TvShow.find({});
        let tvFixes = 0;

        for (const show of tvShows) {
            if (typeof show.poster_path === "string" && show.poster_path.startsWith("/")) {
                if (show.coverImage) {
                    await TvShow.updateOne(
                        { _id: show._id },
                        { $set: { poster_path: show.coverImage }, $unset: { coverImage: "" } }
                    );
                    tvFixes++;
                    logMessage(`TV: ${show.name || show.title} → poster_path replaced with ${show.coverImage}`);
                }
            }
        }

        console.log(`📺 Fixed ${tvFixes} TV show poster paths`);

        console.log("🎯 All replacements done! Log written to /log/poster_replacements.txt");

        await mongoose.disconnect();
    } catch (err) {
        console.error("❌ Error:", err);
    }
}

fixPosterPaths();
