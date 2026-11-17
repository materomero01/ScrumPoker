'use strict';

const config = require('./src/config');
const log = require('./src/logger');
const { createApp } = require('./src/app');

const { server, close } = createApp();

server.listen(config.PORT, () => log.info('server.listening', { port: config.PORT }));

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('server.shutdown', { signal });
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
    await close();
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', err => log.error('process.unhandled_rejection', { err: String(err) }));
