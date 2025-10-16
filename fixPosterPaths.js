// fixPosterPaths.mjs  (or add "type": "module" in package.json)

import mongoose from "mongoose";
import dotenv from "dotenv";

// Load .env file
dotenv.config();

const MONGO_URI = process.env.CONN_STR;

// Import models (adjust paths as needed)
import Movie from "./Models/movieModel.js";
import TvShow from "./Models/tvShowModel.js"; // comment if not needed

(async () => {
    try {
        if (!MONGO_URI) {
            throw new Error("❌ Missing CONN_STR in .env");
        }

        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB");

        // --- Clean Movies ---
        await Movie.updateMany(
            { poster_path: { $regex: "^/images/" } },
            [
                {
                    $set: {
                        poster_path: {
                            $replaceAll: {
                                input: "$poster_path",
                                find: "/images/",
                                replacement: "",
                            },
                        },
                    },
                },
            ]
        );
        console.log("✅ Movies poster_path cleaned");

        // --- Clean TV Shows ---
        await TvShow.updateMany(
            { poster_path: { $regex: "^/images/" } },
            [
                {
                    $set: {
                        poster_path: {
                            $replaceAll: {
                                input: "$poster_path",
                                find: "/images/",
                                replacement: "",
                            },
                        },
                    },
                },
            ]
        );
        console.log("✅ TV Shows poster_path cleaned");

        await mongoose.disconnect();
        console.log("✅ Done & disconnected");
    } catch (err) {
        console.error("❌ Error cleaning:", err);
    }
})();
