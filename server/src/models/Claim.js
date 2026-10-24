import mongoose from 'mongoose';

export const CLAIM_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn'];

const claimSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    claimant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Copied from the item at creation so authorization checks and the owner's
    // "claims to review" list do not need a join.
    itemOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Private: only the claimant, the item owner and admins may read this.
    message: { type: String, required: true, trim: true, minlength: 20, maxlength: 1000 },
    status: { type: String, enum: CLAIM_STATUSES, default: 'pending' },
    decisionNote: { type: String, trim: true, maxlength: 500 },
    decidedAt: { type: Date },
  },
  { timestamps: true },
);

// A user can have at most ONE pending claim per item. Enforced by the database,
// so it also holds under concurrent requests. Rejected or withdrawn claims do
// not count, so the user may try again with more detail.
claimSchema.index(
  { item: 1, claimant: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_claim_per_user' },
);
claimSchema.index({ itemOwner: 1, status: 1, createdAt: -1 });
claimSchema.index({ claimant: 1, createdAt: -1 });
claimSchema.index({ item: 1, status: 1 });

export const Claim = mongoose.model('Claim', claimSchema);
