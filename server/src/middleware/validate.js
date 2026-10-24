import { AppError } from '../utils/AppError.js';

// Validates req.body / req.query / req.params against Zod schemas.
// Parsed (and type-coerced) values are stored on req.validated so controllers
// only ever read data that passed validation. (In Express 5 req.query is a
// read-only getter, so we cannot simply overwrite it.)
export function validate(schemas) {
  return (req, _res, next) => {
    req.validated = req.validated ?? {};
    const details = [];

    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        req.validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ location: part, path: issue.path.join('.'), message: issue.message });
        }
      }
    }

    if (details.length) return next(AppError.validation(details));
    next();
  };
}
