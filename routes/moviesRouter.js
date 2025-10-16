const express = require('express');
const moviesController = require('./../controllers/moviesController');
const authController = require('./../controllers/authController');


const router = express.Router();


// --------------------
// Movie CRUD Routes
// --------------------
router.route('/')
    .get(moviesController.getAllMovies) // public
    .post(authController.protect, authController.restrict('admin'), moviesController.createMovie);

// --------------------
// Genre-specific routes
// --------------------
router.get('/genres', moviesController.getAllGenres);
router.get('/movies-by-genre/:genre', moviesController.getMoviesByGenre);

// --------------------
// Alias / Stats Routes
// --------------------
router.route('/highest-rated')
    .get(moviesController.highestRated, moviesController.getAllMovies);

router.route('/movies-stats')
    .get(authController.protect, moviesController.getMovieStats);

// --------------------
// Single movie by ID
// --------------------
router.route('/:id')
    .get(moviesController.getMovie)
    .patch(authController.protect, authController.restrict('admin'), moviesController.updateMovie)
    .delete(authController.protect, authController.restrict('admin'), moviesController.deleteMovie);

// --------------------
// Debug: log all routes
// --------------------
router.stack.forEach(layer => {
    if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(', ');
        console.log(`${methods} ${layer.route.path}`);
    }
});

module.exports = router;
