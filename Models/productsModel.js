const mongoose = require("mongoose");
const slugify = require("slugify");

const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true },
        normalizedName: { type: String, index: true }, // for search optimization
        description: { type: String },

        // Pricing
        rawPrice: { type: String },                        // "KES 45,000"
        currency: { type: String, default: "UNK" },        // "KES", "USD"
        price: { type: Number, default: 0, index: true },  // normalized to USD
        discount: { type: Number, default: 0 },            // % off
        oldPrice: { type: Number },                        // for showing "before" price

        // Media
        image: { type: String },
        images: [{ type: String }], // ✅ multiple product images

        // Categorization
        category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
        genres: [{ type: String }],   // ✅ good for "tags" like "Networking", "Gaming", etc.
        brand: { type: String },      // ✅ helps with filtering/search

        // Stock
        inStock: { type: Boolean, default: true },
        stock: { type: Number, default: 10 },
        sku: { type: String, unique: true, sparse: true }, // ✅ inventory tracking

        // Source
        source: { type: String },
        platform: {
            type: String,
            enum: ["jumia", "kilimall", "sky", "other"],
            default: "other"
        },

        // Extra Info
        metadata: { type: Object },         // site-specific extras (ratings, discounts, etc.)
        specs: { type: Map, of: String },   // ✅ flexible product details (RAM, speed, etc.)
        tags: [{ type: String, index: true }], // ✅ SEO & faceted search

        // User Interaction
        rating: { type: Number, default: 0 },      // avg rating
        numReviews: { type: Number, default: 0 },  // review count
        views: { type: Number, default: 0 },       // track popularity
        purchases: { type: Number, default: 0 },   // track bestsellers
    },
    { timestamps: true }
);

// Auto-generate slug before save
productSchema.pre("save", async function (next) {
    if (!this.isModified("name")) return next();

    let baseSlug = slugify(this.name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;

    while (await mongoose.models.Product.findOne({ slug })) {
        slug = `${baseSlug}-${counter++}`;
    }

    this.slug = slug;
    this.normalizedName = this.name.toLowerCase();
    next();
});

// Virtual: discountedPrice
productSchema.virtual("discountedPrice").get(function () {
    if (!this.discount || this.discount <= 0) return this.price;
    return this.price - (this.price * this.discount) / 100;
});

// Indexes for performance
productSchema.index({ name: "text", description: "text", tags: "text" });
productSchema.index({ category: 1 });
// productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });

const Product = mongoose.models.Product || mongoose.model("Product", productSchema);

module.exports = Product;
