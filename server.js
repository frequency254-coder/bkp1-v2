const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });

const mongoose = require('mongoose');

process.on('unhandledRejection', (err) =>{
    console.log(err.name, err.message);
    console.log('Unhandled rejection occured! shutting down...');
            process.exit(1);
    });

process.on('uncaughtException', (err) =>{
    console.log(err.name, err.message);
    console.log('uncaught Exception  occured! shutting down...');
            process.exit(1);
  });

const app = require('./app');
const { connectDB, startDBMonitor } = require('./utils/db');

(async () => {
    const connected = await connectDB();
    if (!connected) {
        // Send a 503 error to user on DB failure
        app.use((req, res, next) => {
            next(new CustomError('Database temporarily unavailable. Please try again later.', 503));
        });
    }

})();


const port = process.env.PORT || 5000;

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});





