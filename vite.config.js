import { defineConfig } from "vite";

export default defineConfig({
    root: "frontend",   // Vite will serve from here in dev
    build: {
        outDir: "../public/dist",  // compiled assets land in Express’s public folder
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            "/api": "http://localhost:5000",
            "/movies": "http://localhost:5000",
        },
    },
});

