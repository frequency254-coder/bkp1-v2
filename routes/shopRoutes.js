const express = require("express");
const shopController = require("../controllers/shopController");
const authController = require("../controllers/shopAuthController"); // if you want to protect routes

const router = express.Router();

// Public routes
router.get("/products", shopController.getAllProducts);
router.get("/products/:slug", shopController.getProduct);
router.get("/categories", shopController.getAllCategories);
router.get("/categories/:slug/products", shopController.getProductsByCategory);

// Admin-protected routes
router.post("/products", authController.protect, authController.restrict("admin"), shopController.createProduct);
router.put("/products/:id", authController.protect, authController.restrict("admin"), shopController.updateProduct);
router.delete("/products/:id", authController.protect, authController.restrict("admin"), shopController.deleteProduct);

module.exports = router;
