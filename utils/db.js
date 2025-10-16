const mongoose = require('mongoose');

let dbConnected = false;
let retryTimeout = null;
let retryDelay = 2000; // start with 2s retry

async function connectDB() {
    const DB = process.env.CONN_STR;

    if (!DB) {
        console.error("❌ MongoDB connection string (CONN_STR) is missing!");
        return;
    }

    try {
        await mongoose.connect(DB, {
            serverSelectionTimeoutMS: 5000,  // 5s for initial connect
            socketTimeoutMS: 45000,          // close idle sockets after 45s
            maxPoolSize: 10,                 // limit connections to 10
        });

        console.log('✅ MongoDB initial connection success');
    } catch (err) {
        console.error('❌ Initial MongoDB connection failed:', err.message);
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (retryTimeout) return; // don’t stack retries

    console.log(`🔄 Retrying MongoDB connection in ${retryDelay / 1000}s...`);

    retryTimeout = setTimeout(() => {
        retryTimeout = null;
        connectDB();
        // exponential backoff, cap at 1min
        retryDelay = Math.min(retryDelay * 2, 60000);
    }, retryDelay);
}

function isDBConnected() {
    return dbConnected;
}

// --- Event Listeners ---
mongoose.connection.on('connected', () => {
    dbConnected = true;
    retryDelay = 2000; // reset delay on success
    console.log('✅ MongoDB connected');
});

mongoose.connection.on('disconnected', () => {
    dbConnected = false;
    console.warn('⚠️ MongoDB disconnected');
    scheduleReconnect();
});

mongoose.connection.on('reconnected', () => {
    dbConnected = true;
    console.log('✅ MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
    dbConnected = false;
    console.error('❌ MongoDB error:', err.message);
    scheduleReconnect();
});

// Always validate schema before saving
mongoose.set('runValidators', true);

module.exports = { connectDB, isDBConnected };
