const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Product = require("./Models/productsModel");
const dotenv = require("dotenv");
dotenv.config();

const MONGO_URI = process.env.CONN_STR;
const IMAGE_DIR = path.join(__dirname, "public", "images", "products");

(async () => {
    try {
        await mongoose.connect(MONGO_URI);

        const products = await Product.find({ image: { $exists: true, $ne: "" } });

        const missingFiles = [];

        for (const product of products) {
            // Normalize DB path (strip leading "/images/" if present)
            let imgPath = product.image.replace(/^\/?images[\\/]/, "");
            const expectedPath = path.join(IMAGE_DIR, imgPath);

            if (!fs.existsSync(expectedPath)) {
                missingFiles.push({
                    id: product._id,
                    name: product.name,
                    dbImage: product.image,
                    expectedPath
                });
            }
        }

        if (missingFiles.length) {
            console.log("❌ Missing image files for products:");
            console.table(missingFiles);
        } else {
            console.log("✅ All product images exist in folder.");
        }

        process.exit();
    } catch (err) {
        console.error("❌ Error checking products:", err);
        process.exit(1);
    }
})();
