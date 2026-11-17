'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? (process.env.NODE_ENV === 'test' ? LEVELS.silent : LEVELS.info);

function log(level, msg, extra) {
    if (LEVELS[level] < threshold) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
    (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

module.exports = {
    debug: (m, e) => log('debug', m, e),
    info: (m, e) => log('info', m, e),
    warn: (m, e) => log('warn', m, e),
    error: (m, e) => log('error', m, e),
};
