export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wraps an async route handler so rejected promises reach the error middleware. */
export const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Validates `data` against a zod schema or throws a 400 with field errors. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'Please check the highlighted fields', result.error.flatten().fieldErrors);
  }
  return result.data;
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'A file is larger than 5 MB' });
  if (typeof err?.code === 'string' && err.code.startsWith('LIMIT_')) {
    return res.status(400).json({ error: 'Too many files in one request (maximum 100)' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Unexpected server error' });
}
