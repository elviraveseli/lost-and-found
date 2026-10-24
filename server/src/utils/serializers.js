// Explicit response shapes ("DTOs"). We never send raw Mongo documents to the
// client: choosing every field here makes it impossible to leak a password
// hash, an email address or a private claim message by accident.

const idOf = (value) => (value?._id ?? value)?.toString();

export function toUserDTO(user) {
  const dto = {
    id: idOf(user),
    name: user.name,
    email: user.email,
    role: user.role,
  };
  if (user.isActive !== undefined) dto.isActive = user.isActive;
  if (user.createdAt) dto.createdAt = user.createdAt;
  return dto;
}

export function imageUrl(item) {
  return item.image?.key ? `/api/uploads/${item.image.key}` : null;
}

// viewer: req.user or undefined
export function toItemDTO(item, viewer) {
  const ownerId = idOf(item.owner);
  const isAdmin = viewer?.role === 'admin';
  const dto = {
    id: idOf(item),
    type: item.type,
    title: item.title,
    description: item.description,
    category: item.category,
    date: item.date,
    location: item.location,
    imageUrl: imageUrl(item),
    status: item.status,
    resolvedAt: item.resolvedAt ?? null,
    // Only the display name is public. Contact details are shared only through
    // an accepted claim.
    owner: { id: ownerId, name: item.owner?.name ?? null },
    isOwner: Boolean(viewer && viewer.id === ownerId),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };

  if (dto.isOwner || isAdmin) {
    dto.removed = item.removed;
    dto.removedReason = item.removedReason ?? null;
  }
  if (isAdmin) {
    dto.flagCount = item.flagCount;
    dto.flags = (item.flags ?? []).map((f) => ({
      user: idOf(f.user),
      reason: f.reason,
      createdAt: f.createdAt,
    }));
  }
  return dto;
}

// Claim messages are private. This function must only be called after the
// service has verified that the viewer is the claimant, the item owner or an admin.
export function toClaimDTO(claim, viewer) {
  const claimantId = idOf(claim.claimant);
  const ownerId = idOf(claim.itemOwner);
  const isClaimant = viewer.id === claimantId;
  const isOwner = viewer.id === ownerId;
  const accepted = claim.status === 'accepted';
  const itemPopulated = claim.item && typeof claim.item === 'object' && 'title' in claim.item;

  const dto = {
    id: idOf(claim),
    status: claim.status,
    message: claim.message,
    decisionNote: claim.decisionNote ?? null,
    decidedAt: claim.decidedAt ?? null,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
    item: itemPopulated
      ? { id: idOf(claim.item), title: claim.item.title, type: claim.item.type, status: claim.item.status }
      : { id: idOf(claim.item) },
    claimant: { id: claimantId, name: claim.claimant?.name ?? null },
    viewerRole: isClaimant ? 'claimant' : isOwner ? 'owner' : 'admin',
  };

  // Contact details are exchanged only once the owner accepts the claim.
  if (accepted && (isOwner || viewer.role === 'admin') && claim.claimant?.email) {
    dto.claimant.email = claim.claimant.email;
  }
  if (accepted && isClaimant && claim.itemOwner?.email) {
    dto.ownerContact = { name: claim.itemOwner.name, email: claim.itemOwner.email };
  }
  return dto;
}

export function toNotificationDTO(n) {
  return {
    id: idOf(n),
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    link: n.link ?? null,
    read: n.read,
    createdAt: n.createdAt,
  };
}
