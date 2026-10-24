import * as adminService from '../services/admin.service.js';
import { sendSuccess } from '../utils/response.js';

export async function stats(_req, res) {
  sendSuccess(res, await adminService.stats());
}

export async function listUsers(req, res) {
  const { users, meta } = await adminService.listUsers(req.validated.query);
  sendSuccess(res, users, { meta });
}

export async function updateUser(req, res) {
  sendSuccess(res, await adminService.setUserActive(req.validated.params.id, req.user, req.validated.body.isActive));
}

export async function listItems(req, res) {
  const { items, meta } = await adminService.listItems(req.validated.query, req.user);
  sendSuccess(res, items, { meta });
}

export async function removeItem(req, res) {
  sendSuccess(res, await adminService.removeItem(req.validated.params.id, req.user, req.validated.body.reason));
}

export async function restoreItem(req, res) {
  sendSuccess(res, await adminService.restoreItem(req.validated.params.id, req.user));
}

export async function dismissFlags(req, res) {
  sendSuccess(res, await adminService.dismissFlags(req.validated.params.id, req.user));
}
