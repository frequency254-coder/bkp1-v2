const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    items: [
        {
            product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
            qty: Number
        }
    ],
    total: Number,
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    status: { type: String, default: "pending" },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Order", orderSchema);
