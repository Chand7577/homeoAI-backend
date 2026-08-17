'use strict';

const { cloudinary } = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');
const https = require('https');
const supabase = require('../config/supabase');

// ─── Cloudinary ──────────────────────────────────────────────────────────────

/**
 * Upload PDF to Cloudinary with chunked support for large files.
 */
const uploadPDFToCloudinary = async (filePath, originalName) => {
  console.log(`☁️ uploadPDFToCloudinary start: filePath=${filePath}, exists=${fs.existsSync(filePath)}`);
  try {
    const timestamp = Date.now();
    const sanitizedName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');

    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    console.log(`📊 File size: ${fileSizeInMB.toFixed(2)} MB`);

    const uploadOptions = {
      folder: 'homeo-repertory-pdfs',
      resource_type: 'raw',
      public_id: `${timestamp}-${sanitizedName}`,
      timeout: 600000,
    };

    let result;
    if (fileSizeInMB > 10) {
      console.log(`⚡ Using chunked upload_large for large file (${fileSizeInMB.toFixed(2)} MB)`);
      uploadOptions.chunk_size = 6000000;
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

    if (fs.existsSync(filePath)) {
      console.log(`🗑️ Cleaning up local file: ${filePath}`);
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    return {
      success: true,
      url: result.secure_url || result.url || '',
      publicId: result.public_id || '',
      bytes: result.bytes || 0,
      format: result.format || 'pdf',
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error.message);
    throw new Error(`Cloudinary PDF upload failed: ${error.message}`);
  }
};

// ─── Supabase ─────────────────────────────────────────────────────────────────

/**
 * Upload PDF to Supabase Storage via direct HTTPS (supports up to 50 MB).
 * Uses raw node:https to avoid fetch/undici URL normalisation stripping the
 * trailing dot from bucket names like "repertory-pdfs."
 */
const uploadPDFToSupabase = async (filePath, originalName) => {
  console.log(`⚡ uploadPDFToSupabase start: filePath=${filePath}, exists=${fs.existsSync(filePath)}`);

  const timestamp = Date.now();
  const sanitizedName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
  const fileName = `${timestamp}-${sanitizedName}.pdf`;

  const rawBucket = (process.env.SUPABASE_STORAGE_BUCKET || 'repertory-pdfs.').trim();
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '').trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY ||
    ''
  ).trim();

  if (!supabaseUrl || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set.');
  }

  // Read once — avoid re-reading after stream is consumed
  const fileData = fs.readFileSync(filePath);
  const hostname = supabaseUrl.replace(/^https?:\/\//, '');

  console.log(`📦 Supabase bucket: "${rawBucket}", host: "${hostname}", file size: ${(fileData.length / 1024 / 1024).toFixed(2)} MB`);

  /**
   * Attempt a single upload to bucketStr.
   * Percent-encodes the trailing dot so Node's URL parser doesn't strip it.
   */
  const tryUpload = (bucketStr) => new Promise((resolve, reject) => {
    // "repertory-pdfs." → "repertory-pdfs%2E"
    const encodedBucket = bucketStr.endsWith('.')
      ? bucketStr.slice(0, -1) + '%2E'
      : bucketStr;

    const reqPath = `/storage/v1/object/${encodedBucket}/${encodeURIComponent(fileName)}`;
    console.log(`🔗 POST https://${hostname}${reqPath}`);

    const req = https.request(
      {
        hostname,
        port: 443,
        path: reqPath,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          'Content-Type': 'application/pdf',
          'Content-Length': fileData.length,
          'x-upsert': 'true',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          console.log(`Supabase HTTP ${res.statusCode}: ${body}`);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const publicUrl = `${supabaseUrl}/storage/v1/object/public/${encodedBucket}/${encodeURIComponent(fileName)}`;
            resolve({ url: publicUrl, publicId: fileName, bytes: fileData.length });
          } else {
            reject(new Error(`Supabase ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(fileData);
    req.end();
  });

  // Try primary bucket, then fallback (with/without trailing dot)
  let result;
  try {
    result = await tryUpload(rawBucket);
  } catch (firstErr) {
    const is404 = firstErr.message.includes('404') || firstErr.message.includes('NoSuchBucket') || firstErr.message.includes('Bucket not found');
    if (is404) {
      const altBucket = rawBucket.endsWith('.') ? rawBucket.slice(0, -1) : rawBucket + '.';
      console.warn(`⚠️ Bucket "${rawBucket}" not found, trying alt: "${altBucket}"`);
      result = await tryUpload(altBucket); // throws if alt also fails
    } else {
      throw firstErr;
    }
  }

  console.log(`✅ Supabase upload success! URL: ${result.url}`);

  // Clean up local temp file
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }

  return {
    success: true,
    url: result.url,
    publicId: result.publicId,
    bytes: result.bytes,
    format: 'pdf',
  };
};

// ─── Supabase Delete ─────────────────────────────────────────────────────────

const deleteFromSupabase = async (fileName) => {
  try {
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'repertory-pdfs.';
    const { data, error } = await supabase.storage.from(bucketName).remove([fileName]);
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Supabase delete error:', error.message);
    return { success: false, error: error.message };
  }
};

// ─── Cloudinary Excel ────────────────────────────────────────────────────────

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

    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      format: result.format,
    };
  } catch (error) {
    console.error('Cloudinary Excel upload error:', error);
    throw new Error(`Excel upload failed: ${error.message}`);
  }
};

// ─── Cloudinary Delete ───────────────────────────────────────────────────────

const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return { success: true, result };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return { success: false, error: error.message };
  }
};

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
