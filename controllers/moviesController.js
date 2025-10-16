const Movie = require('../Models/movieModel');
const ApiFeatures = require('./../utils/ApiFeatures');
const asyncErrorHandler = require('./../utils/asyncErrorHandler');
const CustomError = require('./../utils/CustomError');

// 🔹 Helper to normalize poster path consistently
function normalizePosterPath(path) {
    if (!path) return "/images/default.jpg";
    return "/images/" + path.replace(/^\/?images\//, "");
}

// Middleware for alias
exports.highestRated = (req, res, next) => {
    req.query.limit = '10';
    req.query.sort = '-ratings';
    next();
};

exports.getAllMovies = asyncErrorHandler(async (req, res, next) => {
    // Normalize query parameter
    if (req.query.genres && !req.query.genre) {
        req.query.genre = req.query.genres;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    let queryObj = {};
    if (req.query.genre && req.query.genre !== "all") {
        queryObj.$or = [{ genre: req.query.genre }, { genres: req.query.genre }];
    }

    const totalMovies = await Movie.countDocuments(queryObj);

    const movies = await Movie.find(queryObj)
        .sort({ releaseYear: -1 })
        .skip(skip)
        .limit(limit);

    const normalized = movies.map(m => ({
        ...m.toObject(),
        poster_path: normalizePosterPath(m.poster_path || m.coverImage),
        genres: Array.isArray(m.genres)
            ? m.genres
            : m.genre
                ? [m.genre]
                : []
    }));

    res.status(200).json({
        status: "success",
        page,
        totalPages: Math.ceil(totalMovies / limit),
        results: normalized.length,
        data: { movies: normalized }
    });
});
























// exports.getAllMovies = asyncErrorHandler(async (req, res, next) => {
//     // Normalize query parameter (support both ?genre= and ?genres=)
//     if (req.query.genres && !req.query.genre) {
//         req.query.genre = req.query.genres;
//     }
//
//     // Extract page + limit
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 12;
//
//     // Build query
//     let queryObj = {};
//     // if (req.query.genre && req.query.genre !== "all") {
//     //     queryObj.$or = [{ genre: req.query.genre }, { genres: req.query.genre }];
//     // }
//
//     // Count total BEFORE pagination
//     const totalMovies = await Movie.countDocuments(queryObj);
//
//     // Apply ApiFeatures with filtering/pagination
//     const features = new ApiFeatures(Movie.find(queryObj), req.query)
//         .filter()
//         .sort()
//         .limitFields()
//         .paginate();
//
//     let movies = await features.query;
//
//     // Normalize poster_path + genres
//     movies = movies.map(m => ({
//         ...m.toObject(),
//         poster_path: normalizePosterPath(m.poster_path || m.coverImage),
//         genres: Array.isArray(m.genres)
//             ? m.genres
//             : m.genre
//                 ? [m.genre]
//                 : []
//     }));
//
//     res.status(200).json({
//         status: "success",
//         page,
//         totalPages: Math.ceil(totalMovies / limit),
//         results: movies.length,
//         data: { movies }
//     });
// });






// Filtering + pagination
// exports.getAllMovies = asyncErrorHandler(async (req, res, next) => {
//     // Normalize query parameter
//     if (req.query.genres && !req.query.genre) {
//         req.query.genre = req.query.genres;
//     }
//
//
//     const features = new ApiFeatures(Movie.find(), req.query)
//         .filter()
//         .sort()
//         .limitFields()
//         .paginate();
//
//     const totalMovies = await Movie.countDocuments(features.query.getQuery()); // count for same filter
//     if (features.skip >= totalMovies) {
//         return next(new CustomError("Page not found", 404));
//     }
//
//     let movies = await features.query;
//
//     // Normalize poster_path + genres
//     movies = movies.map(m => ({
//         ...m.toObject(),
//         poster_path: normalizePosterPath(m.poster_path || m.coverImage),
//         genres: Array.isArray(m.genres)
//             ? m.genres
//             : m.genre
//                 ? [m.genre]
//                 : []
//     }));
//
//     res.status(200).json({
//         status: "success",
//         results: movies.length,
//         data: { movies }
//     });
// });

// Get single movie
exports.getMovie = asyncErrorHandler(async (req, res, next) => {
    const movie = await Movie.findById(req.params.id);

    if (!movie) {
        return next(new CustomError('Movie with that id is not found!', 404));
    }

    const normalizedMovie = {
        ...movie.toObject(),
        poster_path: normalizePosterPath(movie.poster_path || movie.coverImage),
        genres: Array.isArray(movie.genres)
            ? movie.genres
            : movie.genre
                ? [movie.genre]
                : []
    };

    res.status(200).json({
        status: 'success',
        data: { movie: normalizedMovie }
    });
});

// Create movie
exports.createMovie = asyncErrorHandler(async (req, res, next) => {
    const movie = await Movie.create(req.body);
    res.status(201).json({
        status: 'success',
        data: { movie }
    });
});

// Update movie
exports.updateMovie = asyncErrorHandler(async (req, res, next) => {
    const updatedMovie = await Movie.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
    });

    if (!updatedMovie) {
        return next(new CustomError('Movie with that id is not found!', 404));
    }

    res.status(200).json({
        status: 'success',
        data: { movie: updatedMovie }
    });
});

// Delete movie
exports.deleteMovie = asyncErrorHandler(async (req, res, next) => {
    const deletedMovie = await Movie.findByIdAndDelete(req.params.id);

    if (!deletedMovie) {
        return next(new CustomError('Movie with that id is not found!', 404));
    }

    res.status(204).json({ status: 'success' });
});

// Movie stats
exports.getMovieStats = asyncErrorHandler(async (req, res, next) => {
    const stats = await Movie.aggregate([
        { $match: { ratings: { $gte: 4.1 } } },
        {
            $group: {
                _id: '$releaseYear',
                avgRating: { $avg: '$ratings' },
                movieCount: { $sum: 1 }
            }
        }
    ]);

    res.status(200).json({
        status: 'success',
        count: stats.length,
        data: { stats }
    });
});

// GET /api/v1/movies/movies-by-genre/:genre
exports.getMoviesByGenre = asyncErrorHandler(async (req, res, next) => {
    const genre = req.params.genre || req.query.genre;
    if (!genre) return next(new CustomError("Genre not specified", 400));

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Escape special regex chars
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query = { genres: { $regex: new RegExp(`^${escapeRegex(genre)}$`, "i") } };

    const [movies, total] = await Promise.all([
        Movie.find(query)
            .sort({ releaseYear: -1 })
            .skip(skip)
            .limit(limit),
        Movie.countDocuments(query)
    ]);

    if (page > Math.max(1, Math.ceil(total / limit))) {
        return next(new CustomError("Page not found", 404));
    }

    const normalized = movies.map(m => ({
        ...m.toObject(),
        poster_path: normalizePosterPath(m.poster_path || m.coverImage),
        genres: Array.isArray(m.genres) ? m.genres : m.genre ? [m.genre] : []
    }));

    res.status(200).json({
        status: 'success',
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        results: normalized.length,
        data: { movies: normalized }
    });
});





// // Get movies by genre (with pagination)
// exports.getMoviesByGenre = asyncErrorHandler(async (req, res, next) => {
//     const genre = req.params.genre;
//
//     // Pagination
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 12;
//     const skip = (page - 1) * limit;
//
//     const query = {
//         $or: [{ genre: genre }, { genres: genre }]
//     };
//
//     // Fetch data & count in parallel
//     const [movies, total] = await Promise.all([
//         Movie.find(query).sort({ releaseYear: -1 }).skip(skip).limit(limit),
//         Movie.countDocuments(query)
//     ]);
//
//     // Normalize
//     const normalized = movies.map(m => ({
//         ...m.toObject(),
//         poster_path: normalizePosterPath(m.poster_path || m.coverImage),
//         genres: Array.isArray(m.genres)
//             ? m.genres
//             : m.genre
//                 ? [m.genre]
//                 : []
//     }));
//
//     res.status(200).json({
//         status: 'success',
//         page,
//         totalPages: Math.ceil(total / limit),
//         results: normalized.length,
//         data: { movies: normalized }
//     });
// });


// Get all genres
exports.getAllGenres = asyncErrorHandler(async (req, res, next) => {
    const genres = await Movie.distinct('genres');
    res.status(200).json({
        status: 'success',
        data: { genres }
    });
});


// Render Movies Page (EJS shell)
exports.renderMoviesPage = asyncErrorHandler(async (req, res, next) => {
    res.status(200).render("movies", {
        title: "Movies",
        activePage: "movies",
    });
});
























// const Movie = require('../Models/movieModel');
// const ApiFeatures = require('./../utils/ApiFeatures');
// const asyncErrorHandler = require('./../utils/asyncErrorHandler');
// const CustomError = require('./../utils/CustomError')
//
//     //MIDLEWARE FOR ALIAS
//
//     exports.highestRated = (req,res,next) =>{
//             req.query.limit = '10';
//             req.query.sort = '-ratings';
//
//              next();
//
//     }
//
// // filtering advanced
// exports.getAllMovies = asyncErrorHandler(async (req, res, next) => {
//     const features = new ApiFeatures(Movie.find(), req.query)
//         .filter()
//         .sort()
//         .limitFields()
//         .paginate();
//
//     let movies = await features.query;
//
//     // Normalize image field
//     movies = movies.map(m => {
//         let coverImage;
//
//         if (m.poster_path) {
//             // remove any extra /images/ if already included
//             coverImage = m.poster_path.replace(/^\/?images\//, "");
//         } else if (m.coverImage) {
//             coverImage = m.coverImage.replace(/^\/?images\//, "");
//         } else {
//             coverImage = "default.jpg";
//         }
//
//         return {
//             ...m.toObject(),
//             coverImage
//         };
//     });
//
//     res.status(200).json({
//         status: "success",
//         results: movies.length,
//         data: { movies }
//     });
// });
//
//
// //GET SINGLE MOVIE
//  exports.getMovie = asyncErrorHandler(async (req, res,next) => {
//
//         const movie = await Movie.find({_id: req.params.id});
//
//         if (!movie){
//             const error = new CustomError('Movie with that id is not found!',404);
//             return next(error);
//         }
//         res.status(200).json({
//             status : 'success',
//             data:{
//                 movie
//             }
//         })
//
// });
// // POST/CREATE MOVIE
//
//
//
// exports.createMovie = asyncErrorHandler( async (req, res,next) => {
//
//         const movie = await Movie.create(req.body);
//         res.status(201).json({
//             status : 'success',
//             data:{
//                 movie
//             }
//         })
//     });
//
//
//
//
// //PATCH/UPDATE EXISTING MOVIE
//
// exports.updateMovie =asyncErrorHandler(async (req, res,next) => {
//
//         const updatedMovie = await Movie.findByIdAndUpdate(req.params.id, req.body,{new:true,runValidators: true});
//
//     if (!updatedMovie){
//         const error = new CustomError('Movie with that id is not found!',404);
//         return next(error);
//     }
//
//         res.status(201).json({
//             status : 'success',
//             data:{
//                 movie
//             }
//         })
//
// });
//
// //DELETE MOVIE
//
// exports.deleteMovie = asyncErrorHandler(async (req, res,next) => {
//
//         const deletedMovie = await Movie.findByIdAndDelete(req.params.id);
//
//     if (!deletedMovie){
//         const error = new CustomError('Movie with that id is not found!',404);
//         return next(error);
//     }
//
//         res.status(204).json({
//             status : 'success',
//
//         })
//
// });
//
// exports.getMovieStats =asyncErrorHandler(async (req,res,next) =>{
//
//         const stats = await Movie.aggregate([
//             {$match : {ratings : {$gte:4.1}}},
//             {$group: {
//                 _id: '$releaseYear',
//                     avgRating:{$avg: '$ratings'},
//                     movieCount:{$sum:1}
//             }},
//             // {$sort: {
//             //         avgRating:1
//             //     }}
//         ]);
//         res.status(200).json({
//             status : 'success',
//             count : stats.length,
//             data : {
//                 stats
//             }
//         });
//
// });
// exports.getMoviesByGenre = asyncErrorHandler(async (req,res,next) =>{
//
//         const genre = req.params.genre;
//         const movies = await Movie.aggregate([
//             {$unwind:'$genre'},
//             {$group: {
//                 _id: '$genre',
//                  movieCount: {$sum: 1},
//                     movies: {$push: '$name'},
//
//                 }},
//             {$addFields: {genre: '$_id'}},
//             {$project: {_id: 0}},
//             {$sort: {movieCount: -1}},
//             {$match: {genre:genre}}
//         ])
//         res.status(200).json({
//             status : 'success',
//             count : movies.length,
//             data : {
//                 movies
//             }
//         });
//         //mongo documentation
// });
//
// // Get all genres
// exports.getAllGenres = asyncErrorHandler(async (req, res, next) => {
//     const genres = await Movie.distinct('genre'); // get unique genres
//     res.status(200).json({
//         status: 'success',
//         data: { genres }
//     });
// });
//
//
// // Get movies by genre
// exports.getMoviesByGenre = asyncErrorHandler(async (req, res, next) => {
//     const genre = req.params.genre;
//     const movies = await Movie.find({ genre: genre });
//     res.status(200).json({
//         status: 'success',
//         results: movies.length,
//         data: { movies }
//     });
// });
