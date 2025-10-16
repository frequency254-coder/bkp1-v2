const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Product = require("./Models/productsModel"); // adjust path if needed

const dotenv = require("dotenv");
dotenv.config();

// Mongo connection
const MONGO_URI = process.env.CONN_STR || "mongodb://localhost:27017/yourdb";



async function checkImages() {
    try {
        await mongoose.connect(MONGO_URI);

        const products = await Product.find({});
        const missing = [];

        products.forEach((p) => {
            // Make sure this matches your actual public folder
            const imgPath = path.join(__dirname, "public", p.image);

            if (!fs.existsSync(imgPath)) {
                missing.push({ name: p.name, image: p.image });
            }
        });

        if (missing.length === 0) {
            console.log("✅ All product images exist.");
        } else {
            console.log("❌ Missing images:");
            console.table(missing);
        }
    } catch (err) {
        console.error("Error checking images:", err);
    } finally {
        await mongoose.disconnect();
    }
}

checkImages();

// (async () => {
//     try {
//         await mongoose.connect(MONGO_URI);
//         console.log("✅ Connected to MongoDB");
//
//         const products = await Product.find({});
//         const withImages = [];
//         const missingImages = [];
//
//         for (const p of products) {
//             if (!p.image) {
//                 missingImages.push(p);
//                 continue;
//             }
//
//             const imgPath = p.image.replace(/^\/+/, ""); // strip leading slashes
//             const absPath = path.join(__dirname, "..", "public", imgPath);
//
//             if (fs.existsSync(absPath)) {
//                 withImages.push(p);
//             } else {
//                 missingImages.push(p);
//             }
//         }
//
//         fs.writeFileSync(
//             path.join(__dirname, "products_with_images.json"),
//             JSON.stringify(withImages, null, 2)
//         );
//
//         fs.writeFileSync(
//             path.join(__dirname, "products_missing_images.json"),
//             JSON.stringify(missingImages, null, 2)
//         );
//
//         console.log(`\n✅ Done!`);
//         console.log(` - ${withImages.length} products WITH images saved to scripts/products_with_images.json`);
//         console.log(` - ${missingImages.length} products MISSING images saved to scripts/products_missing_images.json`);
//
//         await mongoose.disconnect();
//         process.exit(0);
//     } catch (err) {
//         console.error("❌ Error:", err);
//         process.exit(1);
//     }
// })();
