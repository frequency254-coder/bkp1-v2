// fetchSeasonsEpisodes.mjs
import mongoose from 'mongoose';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

import TvShow from './../Models/tvShowModel.js'; // Adjust path if needed

const API_KEY = process.env.TMDB_API_KEY;
const MONGO_URI = process.env.CONN_STR;

async function updateSeasonsEpisodes() {
    if (!API_KEY) {
        console.error('❌ TMDB_API_KEY not found in environment variables.');
        return;
    }
    if (!MONGO_URI) {
        console.error('❌ MongoDB connection string not found in environment variables.');
        return;
    }

    try {
        await mongoose.connect(MONGO_URI, {

        });
        console.log('✅ Connected to MongoDB');

        // Fetch only shows missing seasons OR episodes
        const tvShows = await TvShow.find({ $or: [{ seasons: { $exists: false } }, { episodes: { $exists: false } }] });
        console.log(`📺 Found ${tvShows.length} TV shows needing update`);

        for (const show of tvShows) {
            if (!show.tmdbId && !show.id) {
                console.warn(`⚠️ Skipping "${show.title}" → missing TMDB ID`);
                continue;
            }

            const tmdbId = show.tmdbId || show.id;

            try {
                const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${API_KEY}`);

                if (res.status === 404) {
                    console.warn(`⚠️ TV show not found on TMDB: "${show.title}" (ID: ${tmdbId})`);
                    continue;
                }

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data = await res.json();

                const update = {
                    seasons: data.number_of_seasons || 0,
                    episodes: data.number_of_episodes || 0
                };

                await TvShow.updateOne({ _id: show._id }, update);
                console.log(`✅ Updated: ${show.title} → Seasons: ${update.seasons}, Episodes: ${update.episodes}`);

                await new Promise(r => setTimeout(r, 200)); // avoid TMDB rate limits
            } catch (err) {
                console.error(`❌ Error updating "${show.title}":`, err.message);
            }
        }

        console.log('🎯 All done!');
        await mongoose.disconnect();
    } catch (err) {
        console.error('❌ DB connection error:', err);
    }
}

updateSeasonsEpisodes();
