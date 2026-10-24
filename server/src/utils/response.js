// Every successful response has the same shape: { success: true, data, meta? }.
// Errors are shaped by the error handler: { success: false, error: { code, message, details? } }.
export function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
