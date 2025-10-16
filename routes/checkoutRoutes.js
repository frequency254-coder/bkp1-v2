const express = require("express");
const Order = require("../Models/orderModel");
const Product = require("../Models/productsModel");
const router = express.Router();

// Show checkout form
// Show checkout form
router.get("/", async (req, res) => {
    if (!req.session.cart || req.session.cart.length === 0) {
        return res.redirect("/cart");
    }

    try {
        // Populate each item with fresh product info
        const populatedCart = await Promise.all(
            req.session.cart.map(async item => {
                const product = await Product.findById(item.productId).lean();
                return {
                    product,
                    qty: item.qty,
                    priceSnapshot: item.priceSnapshot,
                    currency: item.currency,
                };
            })
        );

        const total = populatedCart.reduce((sum, item) => {
            const price = item.product?.price ?? item.priceSnapshot ?? 0;
            return sum + price * item.qty;
        }, 0);

        res.render("checkout", {
            title: "Checkout - Cash on Delivery",
            cart: populatedCart,
            total,
            user: req.user || null,
        });
    } catch (err) {
        console.error("❌ Checkout render error:", err);
        res.status(500).send("Checkout error");
    }
});


// Handle order placement
router.post("/", async (req, res) => {
    try {
        if (!req.session.cart || req.session.cart.length === 0) {
            return res.redirect("/cart");
        }

        const { customerName, phone, address } = req.body;

        const productIds = req.session.cart.map(i => i.productId);
        const products = await Product.find({ _id: { $in: productIds } });

        const orderItems = [];
        let total = 0;

        // Validate stock and compute totals
        for (const cartItem of req.session.cart) {
            const product = products.find(p => p._id.toString() === cartItem.productId);
            if (!product) continue;

            const qty = Math.min(cartItem.qty, product.stock || 0);
            if (qty <= 0) continue;

            total += product.price * qty;

            orderItems.push({
                product: product._id,
                qty,
            });

            // 🔽 Decrement stock in DB
            product.stock -= qty;
            await product.save();
        }

        if (orderItems.length === 0) {
            return res.redirect("/cart");
        }

        // Create order
        const order = await Order.create({
            user: req.user ? req.user._id : null,
            items: orderItems,
            total,
            customerName,
            phone,
            address,
        });

        const populatedOrder = await Order.findById(order._id).populate("items.product");

        // Clear cart
        req.session.cart = [];

        res.render("order-confirmation", { order: populatedOrder });
    } catch (err) {
        console.error("❌ Checkout error:", err);
        res.status(500).send("Something went wrong during checkout");
    }
});

module.exports = router;
