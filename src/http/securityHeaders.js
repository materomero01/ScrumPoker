'use strict';

const CSP = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    // emoji-picker-element inyecta <style> dentro de su shadow DOM
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss: https://cdn.jsdelivr.net",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ');

function securityHeaders(req, res, next) {
    res.set({
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
}

module.exports = { securityHeaders };
