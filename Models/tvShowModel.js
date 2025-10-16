const mongoose = require('mongoose');

const tvShowSchema = new mongoose.Schema({
    name: { type: String, required: true },
    poster_path: { type: String, default: null },
    ratings: { type: Number, default: 0 },
    releaseYear: { type: Number },
    genres: [{ type: String }],

    seasons: Number,     // <-- add this
    episodes: Number
});

// Fix OverwriteModelError
const TvShow = mongoose.models.TvShow || mongoose.model('TvShow', tvShowSchema);

module.exports = TvShow;
