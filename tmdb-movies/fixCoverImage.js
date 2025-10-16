import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.CONN_STR;

const movieSchema = new mongoose.Schema({
    id: Number,
    poster_path: String,
});

const Movie = mongoose.model("Movie", movieSchema);

async function fixPosterPaths() {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const movies = await Movie.find({ poster_path: { $regex: /^\/\d+$/ } }); // paths like /1145758
    console.log(`Found ${movies.length} movies with missing /images/ prefix or .jpg`);

    for (const movie of movies) {
        const fixedPath = `/images/${movie.id}.jpg`.replace(/\/+/g, '/');
        await Movie.updateOne({ _id: movie._id }, { $set: { poster_path: fixedPath } });
        console.log(`Updated poster_path: ${movie.poster_path} → ${fixedPath}`);
    }

    console.log("✅ Poster paths fixed");
    await mongoose.disconnect();
    console.log("🛑 MongoDB disconnected");
}

fixPosterPaths().catch((err) => {
    console.error(err);
    mongoose.disconnect();
});
