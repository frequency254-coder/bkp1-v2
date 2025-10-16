const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

// Ensure logs folder exists
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

function getLogFilePath() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(logDir, `error-${today}.log`);
}

function rotateLogsIfNeeded(filePath) {
    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size >= MAX_LOG_SIZE) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const archivePath = filePath.replace('.log', `-${timestamp}.log`);
            fs.renameSync(filePath, archivePath);
        }
    }
}

function logError(err) {
    const timeStamp = new Date().toISOString();
    const logMessage = `[${timeStamp}] ${err.stack || err.message}\n`;
    const logFilePath = getLogFilePath();

    if (process.env.NODE_ENV === 'development') {
        console.error(logMessage);
    } else {
        rotateLogsIfNeeded(logFilePath);
        fs.appendFileSync(logFilePath, logMessage);
    }
}

module.exports = logError;
