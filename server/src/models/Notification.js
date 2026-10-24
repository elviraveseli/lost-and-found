import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'claim_received',
  'claim_accepted',
  'claim_rejected',
  'potential_match',
  'report_removed',
];

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 140 },
    body: { type: String, maxlength: 500 },
    // Client-side route to open, e.g. /items/123. Never contains private data.
    link: { type: String, maxlength: 200 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
