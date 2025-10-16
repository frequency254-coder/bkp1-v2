const Product = require("../Models/productsModel");
const Category = require("../Models/categoryModel");
const customError = require("../utils/CustomError");
const asyncErrorHandler = require("../utils/asyncErrorHandler");

/**
 * Utility: format success response
 */
const createResponse = (res, statusCode, data) => {
    res.status(statusCode).json({
        status: "success",
        results: Array.isArray(data) ? data.length : undefined,
        data,
    });
};

/**
 * @desc Get all products
 * @route GET /api/shop/products
 */
exports.getAllProducts = asyncErrorHandler(async (req, res, next) => {
    const products = await Product.find().populate("category", "name slug");
    createResponse(res, 200, { products });
});

/**
 * @desc Get single product
 * @route GET /api/shop/products/:slug
 */
exports.getProduct = asyncErrorHandler(async (req, res, next) => {
    const product = await Product.findOne({ slug: req.params.slug })
        .populate("category", "name slug");

    if (!product) return next(new customError("Product not found", 404));

    createResponse(res, 200, { product });
});

/**
 * @desc Get all categories
 * @route GET /api/shop/categories
 */
exports.getAllCategories = asyncErrorHandler(async (req, res, next) => {
    const categories = await Category.find();
    createResponse(res, 200, { categories });
});

/**
 * @desc Get products by category
 * @route GET /api/shop/categories/:slug/products
 */
exports.getProductsByCategory = asyncErrorHandler(async (req, res, next) => {
    const category = await Category.findOne({ slug: req.params.slug });
    if (!category) return next(new customError("Category not found", 404));

    const products = await Product.find({ category: category._id });
    createResponse(res, 200, { category, products });
});

/**
 * @desc Create a new product
 * @route POST /api/shop/products
 */
exports.createProduct = asyncErrorHandler(async (req, res, next) => {
    const { name, category, price, description, image, inStock, stock } = req.body;

    const cat = await Category.findOne({ slug: category }) || await Category.findById(category);
    if (!cat) return next(new customError("Invalid category", 400));

    const product = await Product.create({
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        category: cat._id,
        price,
        description,
        image,
        inStock,
        stock,
    });

    createResponse(res, 201, { product });
});

/**
 * @desc Update a product
 * @route PUT /api/shop/products/:id
 */
exports.updateProduct = asyncErrorHandler(async (req, res, next) => {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    });

    if (!product) return next(new customError("Product not found", 404));

    createResponse(res, 200, { product });
});

/**
 * @desc Delete a product
 * @route DELETE /api/shop/products/:id
 */
exports.deleteProduct = asyncErrorHandler(async (req, res, next) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return next(new customError("Product not found", 404));

    res.status(204).json({ status: "success", data: null });
});
