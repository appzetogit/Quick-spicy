import multer from 'multer';
import { Readable } from 'stream';
import { cloudinary } from '../../config/cloudinary.js';

// Use in‑memory storage; we stream to Cloudinary
const storage = multer.memoryStorage();

// Generic file filter for common image/video mime types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    // videos
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Please upload an image or video.'));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});

/**
 * Upload a single buffer to Cloudinary.
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Cloudinary upload options (folder, resource_type, etc.)
 * @returns {Promise<Object>} Cloudinary upload result
 */
export function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      // Validate buffer
      if (!buffer || !Buffer.isBuffer(buffer)) {
        return reject(new Error('Invalid buffer provided'));
      }

      if (buffer.length === 0) {
        return reject(new Error('Empty buffer provided'));
      }

      // Extract upload options
      const uploadOptions = {
        resource_type: options.resource_type || 'auto',
        folder: options.folder || 'appzeto'
      };

      // Copy other options (excluding folder and resource_type which are already set)
      Object.keys(options).forEach(key => {
        if (key !== 'folder' && key !== 'resource_type') {
          uploadOptions[key] = options[key];
        }
      });

      console.log('📤 Cloudinary upload options:', {
        folder: uploadOptions.folder,
        resource_type: uploadOptions.resource_type,
        bufferSize: buffer.length
      });

      // Use upload_stream method which is more efficient for buffers
      // Create a readable stream from buffer
      const stream = Readable.from(buffer);

      // Create upload stream
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', {
              message: error.message,
              http_code: error.http_code,
              name: error.name,
              stack: error.stack
            });
            return reject(error);
          }
          if (!result) {
            return reject(new Error('Upload failed: No result returned from Cloudinary'));
          }
          console.log('✅ Cloudinary upload successful:', {
            publicId: result.public_id,
            url: result.secure_url,
            resourceType: result.resource_type
          });
          resolve(result);
        }
      );

      // Handle stream errors
      uploadStream.on('error', (streamError) => {
        console.error('❌ Cloudinary upload stream error event:', streamError);
        reject(streamError);
      });

      // Pipe buffer stream to upload stream
      stream.pipe(uploadStream);
    } catch (error) {
      console.error('❌ Error in uploadToCloudinary:', error);
      reject(error);
    }
  });
}

/**
 * Delete a file from Cloudinary by public ID
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Cloudinary deletion result
 */
export function deleteFromCloudinary(publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

