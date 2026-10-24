import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('API documentation', () => {
  it('serves a valid OpenAPI document that covers the main endpoints', async () => {
    const res = await request(createApp()).get('/api/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/auth/register',
        '/auth/login',
        '/items',
        '/items/{id}',
        '/items/{id}/claims',
        '/items/{id}/matches',
        '/claims/{id}/decision',
        '/notifications',
        '/admin/items/{id}/remove',
      ]),
    );
  });

  it('serves the Swagger UI', async () => {
    const res = await request(createApp()).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
