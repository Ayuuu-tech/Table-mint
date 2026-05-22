const path = require('path');
const fs = require('fs');

/**
 * File Upload Validation Middleware
 * Prevents malicious file uploads and ensures security
 */

// Allowed MIME types for different file categories
const ALLOWED_MIME_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  documents: ['application/pdf', 'text/csv', 'application/vnd.ms-excel']
};

// Blocked file extensions (dangerous)
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js',
  '.jar', '.zip', '.rar', '.dll', '.sys', '.msi', '.app', '.dmg',
  '.sh', '.bash', '.zsh', '.php', '.asp', '.aspx', '.jsp', '.cgi'
];

// Maximum file size (in bytes)
const MAX_FILE_SIZES = {
  image: 5 * 1024 * 1024, // 5MB
  document: 10 * 1024 * 1024, // 10MB
  csv: 50 * 1024 * 1024 // 50MB
};

/**
 * Validate Image Upload
 */
const validateImageUpload = (file) => {
  if (!file) {
    throw new Error('No file provided');
  }

  const ext = path.extname(file.name).toLowerCase();
  
  // Check extension
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    throw new Error(`File type ${ext} is not allowed`);
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.images.includes(file.mimetype)) {
    throw new Error(`Invalid file type. Allowed types: JPG, PNG, WebP, GIF`);
  }

  // Check file size
  if (file.size > MAX_FILE_SIZES.image) {
    throw new Error(`File size exceeds ${MAX_FILE_SIZES.image / (1024 * 1024)}MB limit`);
  }

  // Basic malware check - scan for suspicious binary patterns
  const buffer = file.data.slice(0, 512);
  if (containsSuspiciousPatterns(buffer)) {
    throw new Error('File contains suspicious patterns and may be malicious');
  }

  return true;
};

/**
 * Validate Document Upload
 */
const validateDocumentUpload = (file, type = 'document') => {
  if (!file) {
    throw new Error('No file provided');
  }

  const ext = path.extname(file.name).toLowerCase();
  
  // Check extension
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    throw new Error(`File type ${ext} is not allowed`);
  }

  // Check MIME type
  const allowedTypes = ALLOWED_MIME_TYPES[type] || ALLOWED_MIME_TYPES.documents;
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error(`Invalid file type for ${type}`);
  }

  // Check file size
  const maxSize = MAX_FILE_SIZES[type] || MAX_FILE_SIZES.document;
  if (file.size > maxSize) {
    throw new Error(`File size exceeds ${maxSize / (1024 * 1024)}MB limit`);
  }

  return true;
};

/**
 * Check for Suspicious Binary Patterns
 * Basic malware detection by looking for known malicious signatures
 */
const containsSuspiciousPatterns = (buffer) => {
  // PE (Windows executable) header
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) return true; // MZ header
  
  // ELF (Linux executable) header
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return true;
  
  // Mach-O (macOS executable) header
  if ((buffer[0] === 0xfe && buffer[1] === 0xed && buffer[2] === 0xfa) ||
      (buffer[0] === 0xca && buffer[1] === 0xfe && buffer[2] === 0xba)) return true;
  
  // ZIP archive (potential trojan)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    // Check for suspicious files inside ZIP (optional, requires unzip library)
    return false; // Allow ZIP for now, but log for monitoring
  }

  return false;
};

/**
 * Generate Safe Filename
 * Prevents directory traversal and special character attacks
 */
const generateSafeFilename = (originalName) => {
  // Remove path characters
  const cleaned = path.basename(originalName);
  
  // Remove special characters except dots and hyphens
  const safe = cleaned.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Add timestamp to prevent collisions
  const timestamp = Date.now();
  const ext = path.extname(safe);
  const nameWithoutExt = safe.replace(ext, '');
  
  return `${nameWithoutExt}_${timestamp}${ext}`;
};

/**
 * Middleware for Image Upload Validation
 */
const imageUploadValidator = (req, res, next) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    validateImageUpload(req.files.image);
    
    // Generate safe filename
    req.files.image.originalName = req.files.image.name;
    req.files.image.name = generateSafeFilename(req.files.image.name);
    
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Middleware for Document Upload Validation
 */
const documentUploadValidator = (docType = 'document') => {
  return (req, res, next) => {
    try {
      if (!req.files || !req.files.document) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      validateDocumentUpload(req.files.document, docType);
      
      // Generate safe filename
      req.files.document.originalName = req.files.document.name;
      req.files.document.name = generateSafeFilename(req.files.document.name);
      
      next();
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  };
};

module.exports = {
  validateImageUpload,
  validateDocumentUpload,
  generateSafeFilename,
  imageUploadValidator,
  documentUploadValidator,
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS,
  MAX_FILE_SIZES
};
