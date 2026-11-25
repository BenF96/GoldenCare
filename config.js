// Configuration – read from environment variables and validated once at startup.
require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const errors = [];

const int = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) errors.push(`${name} must be a whole number`);
  return n;
};

const mongoUri = process.env.MONGODB_URI || (isProd ? '' : 'mongodb://127.0.0.1:27017/goldencare');
if (!mongoUri) errors.push('MONGODB_URI is required in production');

// TRUST_PROXY: set to 1 (number of proxies) when running behind a reverse proxy / load balancer,
// so rate limiting sees the real client IP.
const tp = process.env.TRUST_PROXY;
const trustProxy = !tp || tp === 'false' ? false : tp === 'true' ? true : /^\d+$/.test(tp) ? Number(tp) : tp;

const config = {
  env,
  isProd,
  port: int('PORT', 3000),
  mongoUri,
  trustProxy,
  https: process.env.HTTPS === 'true', // set when served over HTTPS (enables HSTS)
  apiRateLimit: int('API_RATE_LIMIT', 300), // API requests per minute per IP
};

if (errors.length) {
  console.error(`Configuration error:\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}

module.exports = config;
