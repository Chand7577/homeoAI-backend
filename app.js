require('express-async-errors');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const errorHandler = require('./middleware/errorHandler');

const authRoutes         = require('./routes/authRoutes');
const repertoryRoutes    = require('./routes/repertoryRoutes');
const rubricRoutes       = require('./routes/rubricRoutes');
const analysisRoutes     = require('./routes/analysisRoutes');
const patientRoutes      = require('./routes/patientRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const medicineRoutes     = require('./routes/medicineRoutes');
const messageRoutes      = require('./routes/messageRoutes');

const app = express();

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Static files serving
app.use('/uploads', express.static(uploadsDir));

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Homeopathy API is running', timestamp: new Date() });
});

// Routes
app.use('/api/auth',          authRoutes);
app.use('/api/repertories',   repertoryRoutes);
app.use('/api/rubrics',       rubricRoutes);
app.use('/api/analysis',      analysisRoutes);
app.use('/api/patients',      patientRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/medicines',     medicineRoutes);
app.use('/api/messages',      messageRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
