const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage configuration for PDFs
const pdfStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'homeo-repertory-pdfs',
    resource_type: 'raw', // Important for PDFs
    allowed_formats: ['pdf'],
    public_id: (req, file) => {
      const timestamp = Date.now();
      const originalName = file.originalname.replace(/\.[^/.]+$/, ''); // Remove extension
      return `${timestamp}-${originalName}`;
    },
  },
});

// Storage configuration for Excel files (if needed)
const excelStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'homeo-repertory-excel',
    resource_type: 'raw',
    allowed_formats: ['xlsx', 'xls', 'csv'],
    public_id: (req, file) => {
      const timestamp = Date.now();
      const originalName = file.originalname.replace(/\.[^/.]+$/, '');
      return `${timestamp}-${originalName}`;
    },
  },
});

// Helper function to delete files from Cloudinary
const deleteFile = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    return { success: true };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return { success: false, error };
  }
};

// Helper function to get file URL with expiration
const getSecureUrl = (publicId, expiresIn = 3600) => {
  return cloudinary.url(publicId, {
    resource_type: 'raw',
    secure: true,
    sign_url: true,
    type: 'authenticated',
  });
};

module.exports = {
  cloudinary,
  pdfStorage,
  excelStorage,
  deleteFile,
  getSecureUrl,
};
