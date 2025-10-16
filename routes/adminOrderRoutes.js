const express = require("express");
const Order = require("../Models/orderModel");
const router = express.Router();

// Middleware (optional) to protect admin routes
function isAdmin(req, res, next) {
    if (req.user && req.user.role === "admin") return next();
    return res.status(403).send("Not authorized");
}

// List all orders
router.get("/", isAdmin, async (req, res) => {
    try {
        const orders = await Order.find()
            .populate("items.product", "name price")
            .sort({ createdAt: -1 });

        res.render("admin/orders", {
            title: "Admin - Orders",
            orders,
            user: req.user || null,
        });
    } catch (err) {
        console.error("❌ Error loading orders:", err);
        res.status(500).send("Error loading orders");
    }
});

// Update order status
router.post("/:id/status", isAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        await Order.findByIdAndUpdate(req.params.id, { status });
        res.redirect("/admin/orders");
    } catch (err) {
        console.error("❌ Error updating order:", err);
        res.status(500).send("Error updating order");
    }
});

module.exports = router;
