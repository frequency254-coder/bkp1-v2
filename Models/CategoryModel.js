const mongoose = require("mongoose");
const slugify = require("slugify");

// ============================
// Category Schema
// ============================
const categorySchema = new mongoose.Schema(
    {
        // 1. Core Identity
        name: {
            type: String,
            required: [true, "Category name is required"],
            unique: true,
            trim: true,
            minlength: [2, "Category name must be at least 2 characters"],
            maxlength: [100, "Category name must be under 100 characters"],
            validate: {
                validator: (v) => /^[a-zA-Z0-9\s\-\&\+]+$/.test(v),
                message: "Category name may only contain letters, numbers, spaces, -, &, +"
            }
        },
        slug: { type: String, unique: true },

        // 2. Hierarchy
        parent: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
        children: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],

        // 3. Subcategories
        subcategories: {
            type: [String],
            set: (arr) => arr.map((s) => s.trim()), // auto-trim each entry
            validate: {
                validator: (arr) => arr.length <= 50,
                message: "Subcategories cannot exceed 50 items"
            }
        },

        // 4. SEO Fields
        metaTitle: {
            type: String,
            trim: true,
            maxlength: [70, "Meta title should not exceed 70 characters"]
        },
        metaDescription: {
            type: String,
            trim: true,
            maxlength: [160, "Meta description should not exceed 160 characters"]
        },
        bannerImage: { type: String, match: /^https?:\/\// }, // must be valid URL

        // 5. Product Management
        productCount: {
            type: Number,
            default: 0,
            min: [0, "Product count cannot be negative"]
        },
        order: { type: Number, default: 0, min: 0 },
        isActive: { type: Boolean, default: true },

        // 6. Scraper Tracking
        lastScrapedPage: { type: Number, default: 0, min: 0 },

        // 7. Redirects (SEO safety)
        slugHistory: [{ type: String }],

        // 8. Description / Marketing
        description: {
            type: String,
            trim: true,
            maxlength: [1000, "Description cannot exceed 1000 characters"]
        },

        // 9. Analytics / Metadata
        metadata: {
            type: Map,
            of: String,
            validate: {
                validator: (map) => map.size <= 50,
                message: "Metadata cannot have more than 50 fields"
            }
        }
    },
    { timestamps: true }
);

// ============================
// Indexes
// ============================
// categorySchema.index({ name: 1 }, { unique: true });
// categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ parent: 1 });
categorySchema.index({ isActive: 1 });
categorySchema.index({ order: 1 });
categorySchema.index({ createdAt: -1 });
categorySchema.index({ updatedAt: -1 });

// ============================
// Slug Middleware
// ============================
categorySchema.pre("save", async function (next) {
    if (!this.isModified("name")) return next();

    const baseSlug = slugify(this.name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;

    while (await mongoose.models.Category.findOne({ slug })) {
        slug = `${baseSlug}-${counter++}`;
    }

    if (this.slug && this.slug !== slug) {
        this.slugHistory = [...(this.slugHistory || []), this.slug];
    }

    this.slug = slug;
    next();
});

// ============================
// Auto-update productCount
// ============================
categorySchema.statics.updateProductCount = async function (categoryId) {
    const Product = mongoose.models.Product;
    const count = await Product.countDocuments({ category: categoryId });
    await this.findByIdAndUpdate(categoryId, { productCount: count });
};

// ============================
// Virtual Fields
// ============================
categorySchema.virtual("url").get(function () {
    return `/categories/${this.slug}`;
});

categorySchema.virtual("childCount").get(function () {
    return this.children ? this.children.length : 0;
});

categorySchema.virtual("isLeaf").get(function () {
    return !this.children || this.children.length === 0;
});

categorySchema.virtual("shortDescription").get(function () {
    if (!this.description) return "";
    return this.description.length > 100
        ? this.description.substring(0, 100) + "..."
        : this.description;
});

categorySchema.virtual("safeMetaTitle").get(function () {
    return this.metaTitle || this.name;
});

// ============================
// JSON Output
// ============================
categorySchema.set("toObject", { virtuals: true });
categorySchema.set("toJSON", { virtuals: true });
categorySchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

const Category =
    mongoose.models.Category || mongoose.model("Category", categorySchema);

module.exports = Category;
