const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  console.error(`❌ [${req.method}] ${req.path} → ${err.message}`);
  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'Internal Server Error' : (err.message || 'Request failed'),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
