const express = require("express");
const Product = require("../Models/productsModel");

const getRandomHeroImage = require("../utils/getRandomHeroImage");

const router = express.Router();

/**
 * 🛒 Cart helpers
 * Store only productId + qty in session
 */
function initCart(req) {
    if (!req.session.cart) req.session.cart = [];
}

function findItem(cart, productId) {
    return cart.find(i => i.productId === productId.toString());
}

/**
 * 1. Add to cart
 * - Stores only productId + qty
 * - Prevents overstock adding
 */
router.post("/add/:id", async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).lean();
        if (!product) return res.status(404).send("Product not found");

        initCart(req);

        const item = findItem(req.session.cart, product._id);
        if (item) {
            if (item.qty < (product.stock || 1)) {
                item.qty += 1;
            }
        } else {
            req.session.cart.push({
                productId: product._id.toString(),
                qty: 1,
                priceSnapshot: product.price, // snapshot in case price changes
                currency: product.currency || "USD",
            });
        }

        res.redirect("/cart");
    } catch (err) {
        console.error("❌ Add to cart error:", err);
        res.status(500).send("Server error");
    }
});

/**
 * 2. Update quantity
 * - Increment, decrement, or set qty
 */
router.post("/update/:id", async (req, res) => {
    initCart(req);

    const { qty } = req.body;
    const newQty = parseInt(qty, 10);

    // Find item in session cart
    const item = findItem(req.session.cart, req.params.id);

    if (!item) {
        return res.redirect("/cart"); // nothing to update
    }

    try {
        const product = await Product.findById(req.params.id).lean();
        if (!product) {
            // Product deleted or missing → remove from cart
            req.session.cart = req.session.cart.filter(i => i.productId !== req.params.id);
            return res.redirect("/cart");
        }

        if (isNaN(newQty) || newQty <= 0) {
            // Remove item if invalid or 0 qty
            req.session.cart = req.session.cart.filter(i => i.productId !== req.params.id);
        } else {
            // Cap at available stock
            item.qty = Math.min(newQty, product.stock || 0);
        }

        res.redirect("/cart");
    } catch (err) {
        console.error("❌ Update cart error:", err);
        res.status(500).send("Server error");
    }
});


/**
 * 3. Remove item
 */
router.post("/remove/:id", (req, res) => {
    initCart(req);

    req.session.cart = req.session.cart.filter(i => i.productId !== req.params.id);
    res.redirect("/cart");
});

/**
 * 4. View cart
 * - Always populate fresh product details from DB
 * - Recomputes totals safely
 */
router.get("/", async (req, res) => {
    initCart(req);

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

    res.render("cart", {
        title: "🛒 Your Cart",
        cart: populatedCart,
        total,
        user: req.user || null,
        bodyClass: "cart-page",
        activePage: "shop",
        contentType: "shop",
        heroImage: getRandomHeroImage("shop"),
        heroSize: "small",
        pageTitle: "Welcome to Frequency ENT",
        pageSubtitle: "BEST NETWORK GADGET AT YOUR POCKET FRIENDLY PRICE",
        ad: res.locals.ad
    });
});

/**
 * 5. Clear cart
 */
router.post("/clear", (req, res) => {
    req.session.cart = [];
    res.redirect("/cart");
});

module.exports = router;
