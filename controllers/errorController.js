const logError = require('../utils/logger');
const CustomError = require('../utils/CustomError');
const e = require("express");

function handleCastErrorDB(err) {
    return new CustomError(`Invalid value for ${err.path}: ${err.value} !`, 400);
}

function handleDuplicateFieldsDB(err) {
    return new CustomError('Duplicate field value. Please use another value.', 400);
}

function handleValidationErrorDB(err) {
    return new CustomError('Invalid input data. Please check and try again.', 400);
}

module.exports = (err, req, res, next) => {
    logError(err); // Log full details privately

    if (res.headersSent) {
        return next(err);
    };

    let error = { ...err, message: err.message };

    if (err.name === 'CastError') error = handleCastErrorDB(err);
    if (err.code && err.code === 11000) error = handleDuplicateFieldsDB(err);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
    if (err.name === "JsonWebTokenError") {
        err = new CustomError("Invalid token. Please log in again!", 401);
    }

    // Handle expired token
    if (err.name === "TokenExpiredError") {
        err = new CustomError("Your session has expired! Please log in again.", 401);
    }


    const statusCode = error.statusCode || 500;
    const statusMessage =
        statusCode === 404
            ? 'Page Not Found'
            : statusCode === 503
                ? 'Service Unavailable'
                : statusCode >= 500
                    ? 'Something Went Wrong'
                    : 'Bad Request';

    const isOperational = err.isOperational || false;
    const displayMessage =
        isOperational && err.message
            ? err.message
            : 'Something went wrong. Please try again later.';

    res.status(statusCode).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${statusCode} - ${statusMessage}</title>
      <style>
        body {
          margin: 0;
          overflow: hidden;
          background: #0f172a;
          color: white;
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          text-align: center;
          position: relative;
        }
        h1 {
          font-size: 6rem;
          margin: 0;
          font-weight: bold;
          z-index: 2;
          animation: glow 2s infinite alternate;
        }
        h2 {
          font-size: 2rem;
          z-index: 2;
        }
        p {
          font-size: 1.2rem;
          z-index: 2;
          margin-bottom: 20px;
        }
        a {
          z-index: 2;
          display: inline-block;
          padding: 10px 20px;
          background: #38bdf8;
          color: #0f172a;
          border-radius: 5px;
          text-decoration: none;
          font-weight: bold;
          transition: background 0.3s ease;
        }
        a:hover {
          background: #0ea5e9;
        }
        @keyframes glow {
          from { text-shadow: 0 0 10px #38bdf8, 0 0 20px #38bdf8, 0 0 30px #38bdf8; }
          to { text-shadow: 0 0 20px #0ea5e9, 0 0 30px #0ea5e9, 0 0 40px #0ea5e9; }
        }
        canvas {
          position: absolute;
          top: 0;
          left: 0;
          z-index: 1;
        }
      </style>
    </head>
    <body>
      <canvas id="stars"></canvas>
      <h1>${statusCode}</h1>
      <h2>${statusMessage}</h2>
      <p>${displayMessage}</p>
      <a href="/coming-soon">Return Home</a>

      <script>
        const canvas = document.getElementById('stars');
        const ctx = canvas.getContext('2d');
        let stars = [];
        let w, h;

        function resize() {
          w = canvas.width = window.innerWidth;
          h = canvas.height = window.innerHeight;
          stars = [];
          for (let i = 0; i < 100; i++) {
            stars.push({
              x: Math.random() * w,
              y: Math.random() * h,
              radius: Math.random() * 2,
              speed: Math.random() * 0.5 + 0.2
            });
          }
        }

        function drawStars() {
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = 'white';
          for (let star of stars) {
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        function moveStars() {
          for (let star of stars) {
            star.y += star.speed;
            if (star.y > h) {
              star.y = 0;
              star.x = Math.random() * w;
            }
          }
        }

        function animate() {
          drawStars();
          moveStars();
          requestAnimationFrame(animate);
        }

        window.addEventListener('resize', resize);
        resize();
        animate();
      </script>
    </body>
    </html>
  `);
};