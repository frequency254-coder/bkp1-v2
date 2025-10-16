import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
const MONGO_URI = process.env.CONN_STR;

const movieSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    title: String,
    overview: String,
    release_date: String,
    genres: [String],
    poster_path: String,
    trailer: String,
});
const Movie = mongoose.model("Movie", movieSchema);

async function updatePosterPaths() {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB Atlas");

    const movies = await Movie.find({ poster_path: { $regex: "tmdb.org" } }); // only TMDb URLs
    console.log(`Found ${movies.length} movies to update`);

    for (const movie of movies) {
        movie.poster_path = `/images/${movie.id}.jpg`;
        await movie.save();
        console.log(`Updated poster_path for movie ID ${movie.id}`);
    }

    console.log("✅ Done updating poster paths");
    await mongoose.connection.close();
}

updatePosterPaths();
