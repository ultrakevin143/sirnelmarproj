const path = require('node:path');
const fs = require('node:fs');
const express = require('express');

function hostingOptions(env = process.env) {
  const proxy = env.TRUST_PROXY || '';
  if (proxy && proxy !== '1') throw new Error('TRUST_PROXY must be unset or 1.');
  return {
    frontendDirectory: env.SERVE_FRONTEND === 'true'
      ? path.resolve(__dirname, '../../frontend/dist/spa') : undefined,
    trustProxy: proxy === '1' ? 1 : false,
  };
}

function validateFrontend(directory) {
  if (directory && !fs.existsSync(path.join(directory, 'index.html'))) {
    throw new Error('Built frontend is missing. Run npm run build from the project root.');
  }
}

function serveFrontend(app, directory) {
  // Unknown API routes must never fall through to the website.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  if (!directory) return;
  app.use(express.static(directory, {
    dotfiles: 'deny',
    setHeaders(res) {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      // Check for new releases on reload, including the HTML entry point.
      res.set('Cache-Control', 'no-cache');
    },
  }));
}

module.exports = { hostingOptions, validateFrontend, serveFrontend };
