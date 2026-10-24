import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

// Local-disk image storage. Files live in UPLOAD_DIR, which is NOT served as a
// static folder: images are streamed through GET /api/uploads/:key, which only
// accepts keys this service generated.
//
// For production you would implement the same functions (saveImage,
// resolveImagePath, deleteImage) against S3, Azure Blob or GCS, usually
// returning a short-lived signed URL. See README "Production image storage".

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const SIGNATURES = [
  { mimeType: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimeType: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(PNG_SIGNATURE) },
  {
    mimeType: 'image/webp',
    ext: 'webp',
    test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

export const ALLOWED_MIME_TYPES = SIGNATURES.map((s) => s.mimeType);
const KEY_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
const MIME_BY_EXT = Object.fromEntries(SIGNATURES.map((s) => [s.ext, s.mimeType]));

// The Content-Type sent by the browser is only a claim. We check the file's
// first bytes ("magic numbers") to confirm it really is one of the allowed images.
export function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer)) ?? null;
}

export async function saveImage(file) {
  const detected = detectImageType(file.buffer);
  if (!detected || detected.mimeType !== file.mimetype) {
    throw AppError.badRequest('Image must be a valid JPEG, PNG or WebP file');
  }
  // Random name: never reuse the uploaded filename (path traversal, overwriting
  // other files, personal names leaking through filenames).
  const key = `${crypto.randomBytes(16).toString('hex')}.${detected.ext}`;
  await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(config.UPLOAD_DIR, key), file.buffer, { flag: 'wx' });
  return { key, mimeType: detected.mimeType };
}

// Returns null for anything that is not a key we generated, which also blocks
// path traversal such as "../../.env".
export function resolveImagePath(key) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) return null;
  return {
    root: config.UPLOAD_DIR,
    key,
    filePath: path.join(config.UPLOAD_DIR, key),
    mimeType: MIME_BY_EXT[key.split('.').pop()],
  };
}

export async function deleteImage(key) {
  const resolved = resolveImagePath(key);
  if (!resolved) return;
  try {
    await fs.unlink(resolved.filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn({ err, key }, 'Could not delete image');
  }
}
