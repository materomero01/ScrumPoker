'use strict';

/** Token bucket simple: `capacity` tokens que se recargan a `refillPerSec`. */
class TokenBucket {
    constructor({ capacity, refillPerSec }, now = Date.now()) {
        this.capacity = capacity;
        this.refillPerSec = refillPerSec;
        this.tokens = capacity;
        this.updatedAt = now;
    }

    take(now = Date.now()) {
        const elapsed = (now - this.updatedAt) / 1000;
        this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
        this.updatedAt = now;
        if (this.tokens < 1) return false;
        this.tokens -= 1;
        return true;
    }
}

/** Middleware Express de ventana fija por IP, sin dependencias. */
function ipRateLimit({ windowMs, max }) {
    const hits = new Map();
    const timer = setInterval(() => hits.clear(), windowMs);
    timer.unref();
    const middleware = (req, res, next) => {
        const key = req.ip || 'unknown';
        const n = (hits.get(key) || 0) + 1;
        hits.set(key, n);
        if (n > max) {
            res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
            return res.status(429).json({ error: 'RATE_LIMITED' });
        }
        next();
    };
    middleware.stop = () => clearInterval(timer);
    return middleware;
}

module.exports = { TokenBucket, ipRateLimit };
