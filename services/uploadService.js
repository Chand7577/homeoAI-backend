const { cloudinary } = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

/**
 * Upload PDF to Cloudinary with optimizations and chunked upload for large files
 * @param {string} filePath - Local file path
 * @param {string} originalName - Original file name
 * @returns {Promise<object>} Upload result with URL and public_id
 */
const uploadPDFToCloudinary = async (filePath, originalName) => {
  console.log(`☁️ uploadPDFToCloudinary start: filePath=${filePath}, exists=${fs.existsSync(filePath)}`);
  try {
    const timestamp = Date.now();
    const sanitizedName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
    
    // Get file size to determine if chunked upload is needed
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    console.log(`📊 File size: ${fileSizeInMB.toFixed(2)} MB`);
    
    const uploadOptions = {
      folder: 'homeo-repertory-pdfs',
      resource_type: 'raw', // Use 'raw' for PDFs, not 'image'
      public_id: `${timestamp}-${sanitizedName}`,
      timeout: 600000, // 10 minute timeout for large files
    };
    
    let result;
    if (fileSizeInMB > 10) {
      console.log(`⚡ Using chunked upload_large for large file (${fileSizeInMB.toFixed(2)} MB)`);
      uploadOptions.chunk_size = 6000000; // 6MB chunks
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_large(filePath, uploadOptions, (error, res) => {
          if (error) return reject(error);
          resolve(res);
        });
      });
    } else {
      result = await cloudinary.uploader.upload(filePath, uploadOptions);
    }

    console.log(`☁️ Cloudinary upload success. URL: ${result.secure_url}`);

    // Delete local file after successful upload
    if (fs.existsSync(filePath)) {
      console.log(`🗑️ Cleaning up local temporary file: ${filePath}`);
      fs.unlinkSync(filePath);
    }

    return {
      success: true,
      url: result ? (result.secure_url || result.url) : '',
      publicId: result ? result.public_id : '',
      bytes: result ? result.bytes : 0,
      format: result ? result.format : 'pdf',
    };
const supabase = require('../config/supabase');

/**
 * Upload PDF to Supabase Storage (supports up to 50MB per file on free tier)
 * @param {string} filePath - Local file path
 * @param {string} originalName - Original file name
 * @returns {Promise<object>} Upload result with public URL and file path
 */
const uploadPDFToSupabase = async (filePath, originalName) => {
  console.log(`⚡ uploadPDFToSupabase start: filePath=${filePath}, exists=${fs.existsSync(filePath)}`);
  try {
    const timestamp = Date.now();
    const sanitizedName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
    const fileName = `${timestamp}-${sanitizedName}.pdf`;
    
    const fileBuffer = fs.readFileSync(filePath);
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'repertory-pdfs';

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) {
      console.error('Supabase Storage upload error:', error);
      if (error.code === 'NoSuchBucket' || error.message?.includes('Bucket not found')) {
        throw new Error(`Supabase bucket "${bucketName}" does not exist. Please create a public bucket named "${bucketName}" in Supabase Storage Dashboard.`);
      }
      if (error.statusCode === '403' || error.message?.includes('security policy')) {
        throw new Error(`Supabase Storage RLS policy error. Please set bucket "${bucketName}" to Public or add an insert policy in Supabase Dashboard.`);
      }
      throw error;
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    console.log(`✅ Supabase upload success! URL: ${publicUrlData.publicUrl}`);

    // Delete local file after successful upload
    if (fs.existsSync(filePath)) {
      console.log(`🗑️ Cleaning up local temporary file: ${filePath}`);
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    return {
      success: true,
      url: publicUrlData.publicUrl,
      publicId: fileName,
      bytes: fileBuffer.length,
      format: 'pdf',
    };
  } catch (error) {
    console.error('Supabase upload error:', error.message);
    throw new Error(`Supabase PDF upload failed: ${error.message}`);
  }
};

/**
 * Delete file from Supabase Storage
 */
const deleteFromSupabase = async (fileName) => {
  try {
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'repertory-pdfs';
    const { data, error } = await supabase.storage
      .from(bucketName)
      .remove([fileName]);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Supabase delete error:', error.message);
    return { success: false, error: error.message };
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
 * @param {string} resourceType - Cloudinary resource type ('image' or 'raw')
 * @returns {Promise<object>} Deletion result
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
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
  uploadPDFToSupabase,
  deleteFromSupabase,
  uploadExcelToCloudinary,
  deleteFromCloudinary,
  getSecureDownloadUrl,
  getStreamUrl,
};
