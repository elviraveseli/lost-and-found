import * as itemService from '../services/item.service.js';
import { sendSuccess } from '../utils/response.js';

// Controllers only translate between HTTP and the service layer: read validated
// input, call one service function, send the response.

export async function list(req, res) {
  const { items, meta } = await itemService.listItems(req.validated.query, req.user);
  sendSuccess(res, items, { meta });
}

export async function listMine(req, res) {
  const { items, meta } = await itemService.listMyItems(req.user, req.validated.query);
  sendSuccess(res, items, { meta });
}

export async function getOne(req, res) {
  sendSuccess(res, await itemService.getItem(req.validated.params.id, req.user));
}

export async function create(req, res) {
  const item = await itemService.createItem(req.validated.body, req.file, req.user);
  sendSuccess(res, item, { status: 201 });
}

export async function update(req, res) {
  const item = await itemService.updateItem(req.validated.params.id, req.validated.body, req.file, req.user);
  sendSuccess(res, item);
}

export async function remove(req, res) {
  await itemService.deleteItem(req.validated.params.id, req.user);
  res.status(204).end();
}

export async function resolve(req, res) {
  sendSuccess(res, await itemService.resolveItem(req.validated.params.id, req.user));
}

export async function flag(req, res) {
  sendSuccess(res, await itemService.flagItem(req.validated.params.id, req.user, req.validated.body.reason), {
    status: 201,
  });
}

export async function matches(req, res) {
  sendSuccess(res, await itemService.getMatches(req.validated.params.id, req.user));
}
