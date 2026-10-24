import { readFileSync } from 'node:fs';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';

const spec = YAML.parse(readFileSync(new URL('./openapi.yaml', import.meta.url), 'utf8'));

export function docsRouter() {
  const router = Router();
  router.get('/openapi.json', (_req, res) => res.json(spec));
  router.use('/', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Lost & Found API' }));
  return router;
}

export { spec as openApiSpec };
