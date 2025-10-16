// utils/getRandomHeroImage.js
const path = require("path");
const fs = require("fs");

function getRandomHeroImage(context = "default") {
    const baseDir = path.join(process.cwd(), "public/images/hero");
    const folder = {
        movies: "movies",
        tvshows: "tvshows",
        shop: "shop",
        contacts: "contacts",
        default: "general"
    }[context] || "general";

    const imagesDir = path.join(baseDir, folder);

    try {
        const files = fs.readdirSync(imagesDir).filter(file =>
            /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
        );

        if (files.length === 0) return "/images/bg-cinema.jpg";

        const randomFile = files[Math.floor(Math.random() * files.length)];
        return `/images/hero/${folder}/${randomFile}`;
    } catch (err) {
        console.error(`❌ No hero images for context ${context}`, err.message);
        return "/images/bg-cinema.jpg";
    }
}

module.exports = getRandomHeroImage;
