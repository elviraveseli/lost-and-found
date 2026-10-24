import mongoose from 'mongoose';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';

export function notFoundHandler(req, _res, next) {
  // originalUrl, not path: path is relative to the router's mount point ("/api").
  const fullPath = req.originalUrl.split('?')[0];
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${fullPath} not found`));
}

// Converts any thrown error into the standard JSON error shape. Known errors are
// mapped to meaningful status codes; unknown errors become a generic 500 so we
// never leak stack traces or internal details to the client.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const appError = toAppError(err);

  if (appError.statusCode >= 500) {
    logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
  }

  const body = { success: false, error: { code: appError.code, message: appError.message } };
  if (appError.details) body.error.details = appError.details;
  res.status(appError.statusCode).json(body);
}

function toAppError(err) {
  if (err instanceof AppError) return err;

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError(413, 'FILE_TOO_LARGE', 'Image is too large');
    }
    return AppError.badRequest(`Upload error: ${err.message}`);
  }
  if (err instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for ${err.path}`);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return AppError.validation(details);
  }
  if (err?.code === 11000) {
    return AppError.conflict('A record with these values already exists');
  }
  if (err?.type === 'entity.parse.failed') {
    return AppError.badRequest('Malformed JSON body');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
}
