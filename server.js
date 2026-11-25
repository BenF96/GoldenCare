const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');
const { startPurgeSchedule } = require('./utils/crud');

const app = express();
app.set('trust proxy', config.trustProxy);

// Security headers, including a strict Content-Security-Policy (no inline scripts/styles)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.https ? [] : null,
      },
    },
    strictTransportSecurity: config.https,
  })
);
app.use(compression());
if (config.env !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

// Health check for hosting platforms / Docker
app.get('/healthz', (req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'unavailable' });
});

app.use(express.static(path.join(__dirname, 'public')));

// ---------- API ----------
const api = express.Router();
api.use(rateLimit({ windowMs: 60 * 1000, limit: config.apiRateLimit, standardHeaders: 'draft-8', legacyHeaders: false }));
api.use(express.json({ limit: '100kb' }));

api.use('/elders', require('./routes/elders'));
api.use('/caregivers', require('./routes/caregivers'));
api.use('/vitals', require('./routes/vitals'));
api.use('/medications', require('./routes/medications'));
api.use('/bins', require('./routes/bins'));
api.use('/appointments', require('./routes/appointments'));
api.use('/records', require('./routes/records'));
api.use('/dashboard', require('./routes/dashboard'));
api.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);

// Central error handler – clear messages for bad input, no internal details for server errors
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => (e.name === 'CastError' ? `Invalid value for ${e.path}` : e.message));
    return res.status(400).json({ error: errors.join('. ') });
  }
  if (err.name === 'CastError') return res.status(400).json({ error: `Invalid ${err.path}` });
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({ error: field === 'label' ? 'A storage bin with this label already exists' : 'This entry already exists' });
  }
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

async function start({ mongoUri = config.mongoUri, port = config.port } = {}) {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);
  const server = await new Promise((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });
  // Permanently remove "Recently deleted" items past their 30 days – at startup, then hourly
  const purgeTimer = startPurgeSchedule();
  server.on('close', () => clearInterval(purgeTimer));
  console.log(`GoldenCare (${config.env}) running at http://localhost:${server.address().port}`);
  return server;
}

if (require.main === module) {
  start()
    .then((server) => {
      // Graceful shutdown: finish in-flight requests, then close the DB connection
      const shutdown = (signal) => {
        console.log(`${signal} received – shutting down`);
        setTimeout(() => process.exit(1), 10000).unref();
        server.close(async () => {
          await mongoose.disconnect();
          process.exit(0);
        });
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
      console.error('Failed to start:', err.message);
      process.exit(1);
    });
}

module.exports = { app, start };
