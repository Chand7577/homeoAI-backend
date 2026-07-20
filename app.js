require('express-async-errors');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const errorHandler = require('./middleware/errorHandler');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('./middleware/auth');

const authRoutes         = require('./routes/authRoutes');
const repertoryRoutes    = require('./routes/repertoryRoutes');
const rubricRoutes       = require('./routes/rubricRoutes');
const analysisRoutes     = require('./routes/analysisRoutes');
const patientRoutes      = require('./routes/patientRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const medicineRoutes     = require('./routes/medicineRoutes');
const messageRoutes      = require('./routes/messageRoutes');
const doctorRoutes       = require('./routes/doctorRoutes');
const consultationRoutes = require('./routes/consultationRoutes');
const kentOcrRoutes      = require('./routes/kentOcrRoutes');
const mmExtractRoutes    = require('./routes/materiaMedicaExtractionRoutes');

const app = express();

// Trust proxy for rate limiting (Render, Heroku, AWS ELB, etc.)
app.set('trust proxy', 1);

// Response time logger middleware using high-resolution real-time
app.use((req, res, next) => {
  // Only log in development mode
  if (process.env.NODE_ENV !== 'production') {
    const start = process.hrtime();
    res.on('finish', () => {
      const diff = process.hrtime(start);
      const timeInMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      // Ignore static files/assets logs if desired, but log all API calls
      if (req.originalUrl.startsWith('/api')) {
        console.log(`⏱️ [API] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - Duration: ${timeInMs}ms`);
      }
    });
  }
  next();
});

// General rate limiter: max 1000 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, 
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for authentication routes to reduce password spraying.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general api limiter to all api routes
app.use('/api', apiLimiter);

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(compression()); // Gzip compression for all responses
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
// CORS configuration - Allow specific origins
const allowedOrigins = [
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3000'] : []),
  'https://homeoai13.netlify.app',
  process.env.FRONTEND_URL
].filter(Boolean);

// Cookie-authenticated browsers always send Origin on cross-site writes.
// Rejecting untrusted origins prevents CSRF without blocking API clients that
// use bearer tokens and do not send an Origin header.
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ success: false, message: 'Untrusted request origin' });
  }
  next();
});

app.use(cors({ 
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true 
}));
app.use(cookieParser());
// Uploaded patient and generated files must not be publicly guessable.
app.use('/uploads', authenticate, express.static(uploadsDir, { index: false, fallthrough: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Homeopathy API is running', timestamp: new Date() });
});

// Routes
app.use('/api/auth',          authLimiter, authRoutes);
app.use('/api/repertories',   repertoryRoutes);
app.use('/api/rubrics',       rubricRoutes);
app.use('/api/analysis',      analysisRoutes);
app.use('/api/patients',      patientRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/medicines',     medicineRoutes);
app.use('/api/messages',      messageRoutes);
app.use('/api/doctors',       doctorRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/kent-ocr',      kentOcrRoutes);
app.use('/api/materia-medica-extract', mmExtractRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
