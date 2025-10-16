const express = require("express");
const Product = require("../Models/productsModel");
const Category = require("../Models/categoryModel");
const getRandomAd = require("../utils/getRandomAd");

const router = express.Router();

// ==============================
// GET All Products (with filters, pagination)
// ==============================
router.get("/", async (req, res, next) => {
    try {
        const { category, inStock, minPrice, maxPrice, search, page = 1, limit = 12 } = req.query;
        const filter = {};

        // Category filter by slug or _id
        if (category && category !== "all") {
            const cat = await Category.findOne({ slug: category }) || await Category.findById(category);
            if (cat) filter.category = cat._id;
        }

        if (inStock) filter.inStock = inStock === "true";

        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice && !isNaN(minPrice)) filter.price.$gte = Number(minPrice);
            if (maxPrice && !isNaN(maxPrice)) filter.price.$lte = Number(maxPrice);
        }

        if (search) {
            filter.name = { $regex: search.trim(), $options: "i" };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Fetch products + count in parallel
        const [products, total, categories] = await Promise.all([
            Product.find(filter)
                .populate("category", "name slug")
                .skip(skip)
                .limit(parseInt(limit)),
            Product.countDocuments(filter),
            Category.find().select("name slug")   // ✅ Fetch categories here
        ]);

        const totalPages = Math.ceil(total / limit);

        res.render("shop", {
            title: "🛒 Frequency ENT - Shop",
            activePage: "shop",
            products,
            categories, // ✅ now defined
            user: req.user || null,
            currentSearch: req.query.search || "",
            currentCategory: category || "all",
            totalPages,
            currentPage: parseInt(page)
        });
    } catch (err) {
        next(err);
    }
});

// ==============================
// GET Single Product by Slug
// ==============================
router.get("/:slug", async (req, res, next) => {
    try {
        const product = await Product.findOne({ slug: req.params.slug }).populate("category", "name slug");
        if (!product) {
            return res.status(404).json({ status: "fail", message: "Product not found" });
        }
        res.json({ status: "success", data: product });
    } catch (err) {
        next(err);
    }
});

// ==============================
// CREATE Product
// ==============================
router.post("/", async (req, res, next) => {
    try {
        const { name, category, image, price, description, inStock, stock } = req.body;

        // Ensure category exists
        const cat = await Category.findOne({ slug: category }) || await Category.findById(category);
        if (!cat) {
            return res.status(400).json({ status: "fail", message: "Invalid category" });
        }

        const product = await Product.create({
            name,
            slug: name.toLowerCase().replace(/\s+/g, "-"), // ✅ auto-slug
            category: cat._id,
            image,
            price,
            description,
            inStock: inStock ?? true,
            stock: stock ?? 0
        });

        res.status(201).json({ status: "success", data: product });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
