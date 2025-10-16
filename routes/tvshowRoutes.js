// controllers/tvshowController.js
const express = require('express')
const TvShow = require('../Models/tvShowModel');
const tvshowController = require('./../controllers/tvshowController');
const ApiFeatures = require('./../utils/ApiFeatures');
const asyncErrorHandler = require('./../utils/asyncErrorHandler');
const CustomError = require('./../utils/CustomError');

const router = express.Router();

// --------------------
// Routes
// --------------------

// 1️⃣ Get all TV shows
router.route('/')
    .get((req, res, next) => {
        console.log(`[API] GET /tvshows → Query:`, req.query);
        next();
    }, tvshowController.getAllTV);


// 3️⃣ Get all genres
router.route('/genres')
    .get((req, res, next) => {
        console.log('[API] GET /tvshows/genres');
        next();
    }, tvshowController.getAllGenres);


// 4️⃣ Get TV shows by genre
router.route('/tvshows-by-genre/:genre')
    .get((req, res, next) => {
        console.log(`[API] GET /tvshows/tvshows-by-genre/${req.params.genre} → Query:`, req.query);
        next();
    }, tvshowController.getTVByGenre);

// 2️⃣ Get single TV show by ID
router.route('/:id')
    .get((req, res, next) => {
        console.log(`[API] GET /tvshows/${req.params.id}`);
        next();
    }, tvshowController.getTV);





// 5️⃣ Create new TV show
router.route('/')
    .post((req, res, next) => {
        console.log('[API] POST /tvshows → Body:', req.body);
        next();
    }, tvshowController.createTV);

// 6️⃣ Update TV show by ID
router.route('/:id')
    .patch((req, res, next) => {
        console.log(`[API] PATCH /tvshows/${req.params.id} → Body:`, req.body);
        next();
    }, tvshowController.updateTV);

// 7️⃣ Delete TV show by ID
router.route('/:id')
    .delete((req, res, next) => {
        console.log(`[API] DELETE /tvshows/${req.params.id}`);
        next();
    }, tvshowController.deleteTV);

// 8️⃣ Highest rated TV shows middleware route
router.route('/highest-rated')
    .get(tvshowController.highestRated, (req, res, next) => {
        console.log('[API] GET /tvshows/highest-rated → Query:', req.query);
        next();
    }, tvshowController.getAllTV);

// 9️⃣ TV show stats
router.route('/stats')
    .get((req, res, next) => {
        console.log('[API] GET /tvshows/stats');
        next();
    }, tvshowController.getTVStats);

module.exports = router;





























// const express = require('express');
// const tvshowController = require('./../controllers/tvshowController');
// const authController = require('./../controllers/authController');
//
// const router = express.Router();
//
//
// // --------------------
// // TV Show CRUD Routes
// // --------------------
// // Render page
// router.get('/view', tvshowController.renderAllTV);
//
// router.route('/')
//     .get(tvshowController.getAllTV) // public API (JSON)
//     .post(authController.protect, authController.restrict('admin'), tvshowController.createTV);
//
// // --------------------
// // Genre-specific routes
// // --------------------
// router.get('/genres', tvshowController.getAllGenres);
// router.get('/tv-by-genre/:genre', tvshowController.getTVByGenre);
//
// // --------------------
// // Alias / Stats Routes
// // --------------------
// router.route('/highest-rated')
//     .get(tvshowController.highestRated, tvshowController.getAllTV);
//
// router.route('/tv-stats')
//     .get(authController.protect, tvshowController.getTVStats);
//
// // --------------------
// // Single TV show by ID
// // --------------------
// router.route('/:id')
//     .get(tvshowController.getTV)
//     .patch(authController.protect, authController.restrict('admin'), tvshowController.updateTV)
//     .delete(authController.protect, authController.restrict('admin'), tvshowController.deleteTV);
//
// // --------------------
// // Debug: log all routes
// // --------------------
// router.stack.forEach(layer => {
//     if (layer.route) {
//         const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
//         console.log(`[TV ROUTE] ${methods} ${layer.route.path}`);
//     }
// });
//
// module.exports = router;
