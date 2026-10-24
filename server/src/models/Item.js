import mongoose from 'mongoose';

export const ITEM_TYPES = ['lost', 'found'];
export const ITEM_STATUSES = ['open', 'resolved'];
export const CATEGORIES = [
  'electronics',
  'wallets-and-cards',
  'keys',
  'bags',
  'clothing',
  'jewellery',
  'documents',
  'pets',
  'other',
];

const flagSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

const itemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ITEM_TYPES, required: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    category: { type: String, enum: CATEGORIES, required: true },
    // The day the item was lost or found (not when the report was created).
    date: { type: Date, required: true },
    location: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    image: {
      key: { type: String },
      mimeType: { type: String },
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ITEM_STATUSES, default: 'open' },
    resolvedAt: { type: Date },
    resolvedClaim: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim' },

    // Moderation. Removed reports are hidden from everyone except admins.
    removed: { type: Boolean, default: false },
    removedAt: { type: Date },
    removedReason: { type: String, trim: true, maxlength: 300 },
    flags: { type: [flagSchema], default: [] },
    flagCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Full-text search over the fields users type into the search box.
itemSchema.index(
  { title: 'text', description: 'text', location: 'text' },
  { weights: { title: 5, location: 2, description: 1 }, name: 'item_text_search' },
);
// Supports the public listing filters and the default "newest first" sort.
itemSchema.index({ removed: 1, status: 1, type: 1, category: 1, date: -1 });
// Supports "my reports" on the dashboard.
itemSchema.index({ owner: 1, createdAt: -1 });
// Supports the admin "flagged reports" queue.
itemSchema.index({ flagCount: -1 });

export const Item = mongoose.model('Item', itemSchema);
