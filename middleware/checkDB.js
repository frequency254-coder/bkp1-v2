const { isDBConnected } = require('../utils/db');

let gracePeriod = true;
setTimeout(() => { gracePeriod = false }, 10000); // 10s after app starts

module.exports = (req, res, next) => {
    const url = req.originalUrl;

    if (
        url.startsWith('/public') ||
        url === '/' ||
        url.startsWith('/api/v1/auth')
    ) {
        return next();
    }

    if (!isDBConnected() && !gracePeriod) {
        console.warn(`⚠️ DB not connected. Blocking request: ${url}`);

        if (url.startsWith('/api')) {
            return res.status(503).json({
                status: 'fail',
                message: 'Service temporarily unavailable. Please try again later.',
            });
        }

        return res.status(503).render('errors/503', {
            message: 'Our service is temporarily unavailable. Please try again later.',
        });
    }

    next();
};
