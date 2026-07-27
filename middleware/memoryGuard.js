'use strict';

/**
 * Memory Guard Middleware
 * Monitors memory usage and triggers garbage collection when needed.
 * Critical for Render free tier (512MB RAM limit).
 */

const memoryGuard = (req, res, next) => {
  const memBefore = process.memoryUsage();
  console.log(`[Memory] Before request: ${Math.round(memBefore.heapUsed / 1024 / 1024)}MB used`);

  // Cleanup after response finishes
  res.on('finish', () => {
    const memAfter = process.memoryUsage();
    const heapUsedMB = Math.round(memAfter.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memAfter.heapTotal / 1024 / 1024);
    
    console.log(`[Memory] After request: ${heapUsedMB}MB / ${heapTotalMB}MB total`);
    
    // If using more than 400MB (80% of 512MB limit), force GC
    if (heapUsedMB > 400 && global.gc) {
      console.log('[Memory] ⚠️ High memory usage detected, forcing garbage collection...');
      global.gc();
      const memAfterGC = process.memoryUsage();
      console.log(`[Memory] ✅ After GC: ${Math.round(memAfterGC.heapUsed / 1024 / 1024)}MB`);
    }
  });

  next();
};

/**
 * Heavy Operation Guard
 * Use this before memory-intensive routes (OCR, image processing, etc.)
 */
const heavyOperationGuard = (req, res, next) => {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  
  // If already using > 350MB (68% of limit), reject new heavy operations
  if (heapUsedMB > 350) {
    console.error(`[Memory] ❌ Request rejected - High memory usage: ${heapUsedMB}MB`);
    return res.status(503).json({
      success: false,
      message: 'Server is currently busy processing other requests. Please try again in a few seconds.',
      memoryUsage: `${heapUsedMB}MB / 512MB`
    });
  }
  
  // Force GC before starting heavy operation
  if (global.gc) {
    global.gc();
    console.log('[Memory] GC triggered before heavy operation');
  }
  
  next();
};

module.exports = {
  memoryGuard,
  heavyOperationGuard
};
