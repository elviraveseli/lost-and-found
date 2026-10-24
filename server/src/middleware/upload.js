import multer from 'multer';
import { config } from '../config/env.js';
import { ALLOWED_MIME_TYPES } from '../services/storage.service.js';
import { AppError } from '../utils/AppError.js';

// Files are kept in memory (max a few MB) so we can inspect the bytes before
// anything touches the disk. The storage service then does the real
// magic-number check and writes the file with a random name.
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(AppError.badRequest('Only JPEG, PNG or WebP images are allowed'));
    }
    cb(null, true);
  },
}).single('image');
