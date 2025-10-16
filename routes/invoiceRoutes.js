const express = require("express");
const PDFDocument = require("pdfkit");
const Order = require("../Models/orderModel");

const router = express.Router();

// GET /invoice/:id → download PDF
router.get("/:id", async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate("items.product");
        if (!order) return res.status(404).send("Order not found");

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=invoice-${order._id}.pdf`);

        doc.pipe(res);

        // Header
        doc.fontSize(20).text("Invoice", { align: "center" });
        doc.moveDown();

        // Customer info
        doc.fontSize(12).text(`Customer: ${order.customerName}`);
        doc.text(`Phone: ${order.phone}`);
        doc.text(`Address: ${order.address}`);
        doc.moveDown();

        // Items table
        doc.fontSize(14).text("Order Items");
        doc.moveDown(0.5);

        order.items.forEach((item, i) => {
            doc.fontSize(12).text(
                `${i + 1}. ${item.product.name} - ${item.qty} × Ksh ${item.product.price} = Ksh ${item.product.price * item.qty}`
            );
        });

        doc.moveDown();
        doc.fontSize(14).text(`Total: Ksh ${order.total}`, { align: "right" });

        doc.end();
    } catch (err) {
        console.error("❌ Error generating invoice:", err);
        res.status(500).send("Error generating invoice");
    }
});

module.exports = router;
