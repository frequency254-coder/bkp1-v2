const express = require("express");
const Category = require("../Models/categoryModel");
const getRandomAd = require("../utils/getRandomAd");


const router = express.Router();

// ==============================
// GET All Categories
// ==============================
router.get("/", async (req, res, next) => {
    try {
        const categories = await Category.find().sort({ name: 1 });
        res.json({
            status: "success",
            results: categories.length,
            data: categories,
            currentCategory: category.slug  // ✅ Consistent variable
        });
    } catch (err) {
        next(err);
    }
});

// ==============================
// CREATE Category
// ==============================
router.post("/", async (req, res, next) => {
    try {
        let { name, slug } = req.body;

        if (!name) {
            return res.status(400).json({ status: "fail", message: "Category name is required" });
        }

        // Auto-generate slug if missing
        slug = slug || name.toLowerCase().replace(/\s+/g, "-");

        // Check uniqueness
        const exists = await Category.findOne({ slug });
        if (exists) {
            return res.status(400).json({ status: "fail", message: "Category already exists" });
        }

        const category = await Category.create({ name, slug });

        res.status(201).json({ status: "success", data: category });
    } catch (err) {
        next(err);
    }
});

// ==============================
// UPDATE Category
// ==============================
router.patch("/:id", async (req, res, next) => {
    try {
        const { name, slug } = req.body;
        const updateData = {};

        if (name) updateData.name = name;
        if (slug) updateData.slug = slug.toLowerCase().replace(/\s+/g, "-");

        const category = await Category.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true,
        });

        if (!category) {
            return res.status(404).json({ status: "fail", message: "Category not found" });
        }

        res.json({ status: "success", data: category });
    } catch (err) {
        next(err);
    }
});

// ==============================
// DELETE Category
// ==============================
router.delete("/:id", async (req, res, next) => {
    try {
        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) {
            return res.status(404).json({ status: "fail", message: "Category not found" });
        }
        res.status(204).json({ status: "success", data: null });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
