const { cloudinary } = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

/**
 * Upload PDF to Cloudinary with optimizations
 * @param {string} filePath - Local file path
 * @param {string} originalName - Original file name
 * @returns {Promise<object>} Upload result with URL and public_id
 */
const uploadPDFToCloudinary = async (filePath, originalName) => {
  try {
    const timestamp = Date.now();
    const sanitizedName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
    
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'homeo-repertory-pdfs',
      resource_type: 'raw',
      public_id: `${timestamp}-${sanitizedName}`,
      // Optimizations for faster upload
      upload_preset: undefined, // Use default
      chunk_size: 6000000, // 6MB chunks for faster upload
      timeout: 600000, // 10 minute timeout
    });

    // Delete local file after successful upload
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      format: result.format,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`PDF upload failed: ${error.message}`);
  }
};

/**
 * Upload Excel to Cloudinary with optimizations
 * @param {string} filePath - Local file path
 * @param {string} originalName - Original file name
 * @returns {Promise<object>} Upload result with URL and public_id
 */
const uploadExcelToCloudinary = async (filePath, originalName) => {
  try {
    const timestamp = Date.now();
    const sanitizedName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
    
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'homeo-repertory-excel',
      resource_type: 'raw',
      public_id: `${timestamp}-${sanitizedName}`,
      invalidate: true,
    });

    // Delete local file after successful upload
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      format: result.format,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Excel upload failed: ${error.message}`);
  }
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<object>} Deletion result
 */
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'raw',
    });
    return { success: true, result };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get optimized download URL with expiration
 * @param {string} publicId - Cloudinary public ID
 * @param {number} expiresIn - Expiration time in seconds (default 1 hour)
 * @returns {string} Secure URL
 */
const getSecureDownloadUrl = (publicId, expiresIn = 3600) => {
  const expirationTimestamp = Math.floor(Date.now() / 1000) + expiresIn;
  
  return cloudinary.url(publicId, {
    resource_type: 'raw',
    secure: true,
    sign_url: true,
    type: 'upload',
    expires_at: expirationTimestamp,
  });
};

/**
 * Stream file directly from Cloudinary (for large files)
 * @param {string} publicId - Cloudinary public ID
 * @returns {string} Stream URL
 */
const getStreamUrl = (publicId) => {
  return cloudinary.url(publicId, {
    resource_type: 'raw',
    secure: true,
    flags: 'attachment',
  });
};

module.exports = {
  uploadPDFToCloudinary,
  uploadExcelToCloudinary,
  deleteFromCloudinary,
  getSecureDownloadUrl,
  getStreamUrl,
};
