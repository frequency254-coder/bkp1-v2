const  mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs  = require('fs');
const Movie = require('./../Models/movieModel');

dotenv.config({ path: './config.env' });

const DB = process.env.CONN_STR;


// Connect to MongoDB
mongoose.connect(DB, {

}).then(() => {
    console.log('MongoDB connection successful');
}).catch(err => {
    console.error('MongoDB connection error:', err.message);
});


// READ MOVIES.JSON FILES

const movies = JSON.parse(fs.readFileSync('./data/movies.json', 'utf-8'));



// IMPORT MOVIES
const importMovies = async () =>{
    try {
        await Movie.create(movies);
        console.log('data imported successfully')
    }catch (err){
        console.log(err.message);
    }

    process.exit();
}
importMovies();

