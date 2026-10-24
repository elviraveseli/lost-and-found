import * as claimService from '../services/claim.service.js';
import { sendSuccess } from '../utils/response.js';

export async function create(req, res) {
  const claim = await claimService.createClaim(req.validated.params.id, req.user, req.validated.body.message);
  sendSuccess(res, claim, { status: 201 });
}

export async function listForItem(req, res) {
  sendSuccess(res, await claimService.listClaimsForItem(req.validated.params.id, req.user));
}

export async function listMine(req, res) {
  const { claims, meta } = await claimService.listMyClaims(req.user, req.validated.query);
  sendSuccess(res, claims, { meta });
}

export async function listReceived(req, res) {
  const { claims, meta } = await claimService.listReceivedClaims(req.user, req.validated.query);
  sendSuccess(res, claims, { meta });
}

export async function getOne(req, res) {
  sendSuccess(res, await claimService.getClaim(req.validated.params.id, req.user));
}

export async function decide(req, res) {
  sendSuccess(res, await claimService.decideClaim(req.validated.params.id, req.user, req.validated.body));
}

export async function withdraw(req, res) {
  sendSuccess(res, await claimService.withdrawClaim(req.validated.params.id, req.user));
}
