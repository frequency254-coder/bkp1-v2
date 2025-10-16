// controllers/tvshowController.js
const express = require('express')
const TvShow = require('../Models/tvShowModel');
const ApiFeatures = require('./../utils/ApiFeatures');
const asyncErrorHandler = require('./../utils/asyncErrorHandler');
const CustomError = require('./../utils/CustomError');

// --------------------
// Middleware Alias
// --------------------
exports.highestRated = (req, res, next) => {
    req.query.limit = '10';
    req.query.sort = '-ratings';
    next();
};
// 🔹 Helper to normalize poster path consistently
function normalizePosterPath(path) {
    if (!path) return "/images/default.jpg";
    return "/images/" + path.replace(/^\/?images\//, "");
}

// --------------------
// Get all TV shows (API)
// --------------------
// controllers/tvshowController.js
exports.getAllTV = asyncErrorHandler(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    let queryObj = {};
    if (req.query.genre && req.query.genre !== "all") {
        queryObj.$or = [{ genre: req.query.genre }, { genres: req.query.genre }];
    }

    const totalTvShows = await TvShow.countDocuments(queryObj);

    const tvshows = await TvShow.find(queryObj)
        .sort({ releaseYear: -1 })
        .skip(skip)
        .limit(limit);

    const normalized = tvshows.map(t => ({
        ...t.toObject(),
        poster_path: normalizePosterPath(t.poster_path || t.coverImage),
        genres: Array.isArray(t.genres) ? t.genres : t.genre ? [t.genre] : []
    }));

    res.status(200).json({
        status: "success",
        page,
        totalPages: Math.ceil(totalTvShows / limit),
        results: normalized.length,
        data: { tvshows: normalized }
    });
});







// exports.getAllTV = asyncErrorHandler(async (req, res, next) => {
//     // Default sort by latest releaseYear (desc)
//     if (!req.query.sort) {
//         req.query.sort = '-releaseYear';
//     }
//
//     const features = new ApiFeatures(TvShow.find(), req.query)
//         .filter()
//         .sort()
//         .limitFields()
//         .paginate();
//
//     let tvShows = await features.query;
//
//     // Normalize safely
//     tvShows = tvShows.map(tv => {
//         const poster = tv.poster_path || "";
//         const imagePath =
//             typeof poster === "string" && poster.startsWith("/images/")
//                 ? poster
//                 : poster
//                     ? "/images/" + poster
//                     : "/images/default.jpg";
//
//         return {
//             id: tv._id,
//             name: tv.name,
//             imagePath,
//             overview: tv.overview || "",
//             ratings: tv.ratings || 0,
//             releaseYear: tv.releaseYear || "N/A",
//             seasons: tv.seasons || "N/A",
//             episodes: tv.episodes || "N/A",
//             status: tv.status || "",
//             genres: Array.isArray(tv.genre) ? tv.genre : [],
//         };
//     });
//
//     res.status(200).json({
//         status: "success",
//         results: tvShows.length,
//         data: { tvShows },
//     });
// });

// --------------------
// Render EJS page (Frontend)
// --------------------
exports.renderAllTV = async (req, res) => {
    try {
        const tvShowsFromDB = await TvShow.find().sort({ releaseYear: -1 }); // ✅ latest first

        const tvShows = tvShowsFromDB.map(tv => {
            const imagePath = tv.poster_path
                ? (tv.poster_path.startsWith('/images/') ? tv.poster_path : '/images/' + tv.poster_path)
                : '/images/default.jpg';

            return { ...tv.toObject(), imagePath };
        });

        res.render('tvshows', { title: 'TV Shows', activePage: "tvshows", tvshows: tvShows });

    } catch (err) {
        console.error('Error rendering TV shows:', err);
        res.status(500).send('Server Error');
    }
};


// --------------------
// Get single TV show
// --------------------
exports.getTV = asyncErrorHandler(async (req, res, next) => {
    const tv = await TvShow.findById(req.params.id);

    if (!tv) {
        return next(new CustomError('TV show not found!', 404));
    }

    res.status(200).json({
        status: 'success',
        data: { tv:tv }
    });
});

// --------------------
// Create TV show
// --------------------
exports.createTV = asyncErrorHandler(async (req, res, next) => {
    const tv = await TvShow.create(req.body);

    res.status(201).json({
        status: 'success',
        data: { tv }
    });
});

// --------------------
// Update TV show
// --------------------
exports.updateTV = asyncErrorHandler(async (req, res, next) => {
    const updatedTV = await TvShow.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
    });

    if (!updatedTV) {
        return next(new CustomError('TV show not found!', 404));
    }

    res.status(200).json({
        status: 'success',
        data: { tv: updatedTV }
    });
});

// --------------------
// Delete TV show
// --------------------
exports.deleteTV = asyncErrorHandler(async (req, res, next) => {
    const deletedTV = await TvShow.findByIdAndDelete(req.params.id);

    if (!deletedTV) {
        return next(new CustomError('TV show not found!', 404));
    }

    res.status(204).json({
        status: 'success',
        data: null
    });
});

// --------------------
// TV show stats
// --------------------
exports.getTVStats = asyncErrorHandler(async (req, res, next) => {
    const stats = await TvShow.aggregate([
        { $match: { ratings: { $gte: 4.1 } } },
        {
            $group: {
                _id: '$releaseYear', // ✅ use releaseYear from schema
                avgRating: { $avg: '$ratings' },
                tvCount: { $sum: 1 }
            }
        },
        { $sort: { _id: -1 } } // ✅ newest years first
    ]);

    res.status(200).json({
        status: 'success',
        count: stats.length,
        data: { stats }
    });
});

// --------------------
// Get all genres
// --------------------
exports.getAllGenres = async (req, res, next) => {
    try {
        const genres = await TvShow.distinct("genres");  // or however you fetch
        res.status(200).json({
            status: "success",
            results: genres.length,
            data: {genres}
        });
    } catch (err) {
        res.status(400).json({
            status: "fail",
            message: err.message
        });
    }
};
exports.getTVByGenre = asyncErrorHandler(async (req, res, next) => {
    const genre = req.params.genre;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const [tvShows, total] = await Promise.all([
        TvShow.find({ genres: { $in: [genre] } })  // ✅ use `genres` array
            .sort({ releaseYear: -1 })
            .skip(skip)
            .limit(limit),
        TvShow.countDocuments({ genres: { $in: [genre] } })
    ]);

    res.status(200).json({
        status: 'success',
        page,
        totalPages: Math.ceil(total / limit),
        results: tvShows.length,
        data: { tvshows: tvShows }
    });
});


// --------------------
// Get TV by genre
// --------------------

