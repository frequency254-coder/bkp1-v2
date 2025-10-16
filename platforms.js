// platforms.js
module.exports = [
    {
        name: "Slot Nigeria",
        key: "slot_ng",
        searchUrl: (q, page = 1) =>
            `https://slot.ng/catalogsearch/result/?q=${encodeURIComponent(q)}&p=${page}`,
        selectors: {
            item: ".product-item-info",
            name: ".product-item-link",
            price: ".price",
        },
        puppeteer: false, // Axios works fine (static HTML)
    },
    {
        name: "PC International",
        key: "pc_international",
        searchUrl: (q, page = 1) =>
            `https://pcinternational.co.za/?s=${encodeURIComponent(q)}&post_type=product&paged=${page}`,
        selectors: {
            item: "ul.products li.product", // ✅ matches WooCommerce products
            name: "h2.woo-loop-product__title, .woocommerce-loop-product__title",
            price: ".woocommerce-Price-amount",
        },
        puppeteer: true, // safer, as some listings lazy-load
        menuUrl: "https://pcinternational.co.za/", // ✅ for category scraper
        menuSelectors: {
            navItem: "li.nav-item",
            mainLink: "> .item-name a",
            submenuBlock: ".item-submenu .menu-block",
            submenuGroup: "p a, p",
            submenuItem: "ul.wp-block-list li a",
        },
    },
    {
        name: "Laptop Clinic Kenya",
        key: "laptop_clinic_ke",
        searchUrl: (q, page = 1) =>
            `https://laptopclinic.co.ke/search?q=${encodeURIComponent(q)}&page=${page}`,
        selectors: {
            item: ".product-item",
            name: ".product-item-meta h2 a, .product-item__title", // ✅ covers both templates
            price: ".price .price-item--regular, .price .price-item--sale, .price", // fallback
        },
        puppeteer: true, // needs Puppeteer (Shopify search injects products dynamically)
    },
];
