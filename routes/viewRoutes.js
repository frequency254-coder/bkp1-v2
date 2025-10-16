const express = require("express");
const router = express.Router();
const path = require("path");

// Models
const Movie = require(path.join(__dirname, "..", "Models", "movieModel"));
const getRandomHeroImage = require("../utils/getRandomHeroImage");


let TvShow;
try {
    TvShow = require(path.join(__dirname, "..", "Models", "tvShowModel"));
} catch (err) {
    TvShow = null;
    console.warn("⚠️ TV Show model not found, /tvshows will return empty.");
}

// ==============================
// Config
// ==============================
const ITEMS_PER_PAGE = 15;

// ==============================
// Helpers
// ==============================
function extractGenres(items = []) {
    const genresSet = new Set();
    items.forEach(item => {
        let g = item.genres || item.genre || [];
        if (typeof g === "string") g = [g];
        if (Array.isArray(g)) g.forEach(x => {
            if (x) genresSet.add(String(x).trim());
        });
    });
    return Array.from(genresSet).sort((a, b) => String(a).localeCompare(String(b)));
}
function createOrderObj(requestedSort, contentType = "movies") {
    switch (requestedSort) {
        case "release":
            // Movies → release_date ; TV Shows → first_air_date
            return contentType === "movies"
                ? { release_date: -1, _id: -1 }
                : { first_air_date: -1, _id: -1 };

        case "title":
            return { title: 1, _id: 1 }; // alphabetical

        default:
            return { _id: -1 }; // fallback = newest inserted
    }
}



function pickHighlight(items = []) {
    if (!items.length) return null;
    return [...items].sort((a, b) => {
        const aDate = new Date(a.releaseYear || a.release_date || a.first_air_date || a.createdAt || 0).getTime();
        const bDate = new Date(b.releaseYear || b.release_date || b.first_air_date || b.createdAt || 0).getTime();
        return bDate - aDate;
    })[0];
}

// ==============================
// Movies Route
// ==============================

router.get("/movies", async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * ITEMS_PER_PAGE;
        const currentGenre = req.query.genre || "all";
        const currentSearch = req.query.search || "";

        const requestOrderBy=req.query.sort || "release";
      let order=createOrderObj(requestOrderBy, "movies");
        // ------------------------------
        // Build filter
        // ------------------------------
        let filter = {};

        // Genre filter
        if (currentGenre !== "all") filter.genres = {$in: [currentGenre]};

        // Title search
        if (currentSearch) filter.title = {$regex: currentSearch, $options: "i"};

        // Include movies with no releaseDate or already released
        filter.$or = [
            {releaseDate: {$exists: false}},
            {releaseDate: {$lte: new Date()}}
        ];

        // ------------------------------
        // Fetch movies with pagination
        // ------------------------------

        let movies = await Movie.find(filter)
            .sort(order)
            .skip(skip)
            .limit(ITEMS_PER_PAGE)
            .lean();

        // ------------------------------
        // Normalize poster paths
        // ------------------------------
        movies = movies.map(m => ({
            ...m,
            poster_path: m.poster_path
                ? (m.poster_path.startsWith('/images/') ? m.poster_path : '/images/' + m.poster_path)
                : '/images/default.jpg'
        }));

        // ------------------------------
        // Pagination info
        // ------------------------------
        const totalCount = await Movie.countDocuments(filter);
        const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));


        // ------------------------------
        // All genres
        // ------------------------------
        const genres = await Movie.distinct("genres");

        // ------------------------------
        // Highlight movie (first page only)
        // ------------------------------
        let highlight = null;
        if (page === 1 && movies.length) {
            highlight = pickHighlight(movies);
        }

        // ------------------------------
        // Render
        // ------------------------------
        res.render("movies", {
            title: "🎬 Frequency ENT - Movies",
            activePage: "movies",
            contentType: "movies",
            movies,
            highlight,
            genres,
            user: req.user || null,
            currentPage: page,
            totalPages,
            bodyClass: "movies-page",
            currentGenre,
            currentSearch,
            heroSize: "small",
            pageTitle: "Browse Movies 🎥",
            pageSubtitle: "Find the latest and greatest films",
            heroImage: getRandomHeroImage("movies") || "/images/bg-cinema.jpg", // ✅ FIXED
            ad: res.locals.ad,
        });
    } catch (err) {
        console.error("❌ Error in GET /movies:", err);
        next(err);
    }
});


// ==============================
// TV Shows Route
// ==============================
// TV Shows Route
// ==============================
// TV Shows Route
// ==============================
router.get("/tvshows", async (req, res) => {
    try {
        if (!TvShow) {
            return res.render("tvshows", {
                tvshows: [],
                genres: [],
                highlight: null,
                user: req.user || null,
                activePage: "tvshows",
                contentType: "tvshows",
                currentPage: 1,
                totalPages: 1,
                currentGenre: "all",
                currentSearch: "",
                heroImage: getRandomHeroImage('movies') || "/images/bg-cinema.jpg", // ✅ FIXED
                ad: res.locals.ad,
            });
        }

        const page = parseInt(req.query.page) || 1;
        const currentGenre = req.query.genre || "all";
        const currentSearch = req.query.search || "";
        const ITEMS_PER_PAGE = 15;

        // ------------------------------ Filter
        let filter = {};
        if (currentGenre !== "all") filter.genres = { $in: [currentGenre] };
        if (currentSearch) filter.title = { $regex: currentSearch, $options: "i" };

        // ------------------------------ Aggregation
        const tvshows = await TvShow.aggregate([
            { $match: filter },
            {
                $addFields: {
                    hasPoster: {
                        $cond: [
                            { $and: [
                                    { $ifNull: ["$poster_path", false] },
                                    { $ne: ["$poster_path", ""] }
                                ] },
                            1, // has poster
                            0  // missing poster
                        ]
                    },
                    sortDate: {
                        $ifNull: ["$first_air_date", "$createdAt"]
                    }
                }
            },
            {
                $sort: {
                    hasPoster: -1,   // posters first, missing last
                    sortDate: -1     // newest first within group
                }
            },
            { $skip: (page - 1) * ITEMS_PER_PAGE },
            { $limit: ITEMS_PER_PAGE }
        ]);

        // ------------------------------ Normalize poster paths
        const tvshowsData = tvshows.map(t => ({
            ...t,
            poster_path: t.poster_path
                ? (t.poster_path.startsWith("/images/") ? t.poster_path : "/images/" + t.poster_path)
                : "/images/default.jpg",
            releaseYear: t.releaseYear || (t.first_air_date ? new Date(t.first_air_date).getFullYear() : "Unknown"),
            overview: t.overview || "No description",
            trailer: t.trailer || null
        }));

        // ------------------------------ Total count / pages
        const totalCount = await TvShow.countDocuments(filter);
        const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

        // ------------------------------ Genres
        let genres = await TvShow.distinct("genres");
        genres = genres
            .map(g => g.trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));

        // ------------------------------ Render
        res.render("tvshows", {
            title: "🎬 Frequency ENT - TV Shows",
            tvshows: tvshowsData,
            genres,
            user: req.user || null,
            activePage: "tvshows",
            contentType: "tvshows",
            currentPage: page,
            totalPages,
            currentGenre,
            currentSearch,
            bodyClass: "tvshows-page",
            heroSize: "small",
            pageTitle: "Top TV Shows 📺",
            pageSubtitle: "Binge-worthy series, just for you",
            heroImage: getRandomHeroImage('tvshows') || "/images/bg-cinema.jpg", // ✅ FIXED
            ad: res.locals.ad,
        });

    } catch (err) {
        console.error("❌ Error in GET /tvshows:", err);
        res.status(500).send("Internal Server Error");
    }
});

// ==============================
// Home Route
// ==============================
router.get("/", async (req, res, next) => {
    try {
        // For now ads are static, later can move to DB
        const ads =  res.locals.ad;

        res.render("home", {
            title: "🎬 Frequency ENT - Home",
            activePage: "home",
            user: req.user || null,
            ads,
            heroSize: "large",
            pageTitle: "Welcome to Frequency ENT",
            pageSubtitle: "Movies, TV Shows & Gaming in one place",
            heroImage: getRandomHeroImage("movies") || "/images/bg-cinema.jpg",

        });
    } catch (err) {
        console.error("❌ Error in GET /:", err);
        next(err);
    }
});



module.exports = router;


