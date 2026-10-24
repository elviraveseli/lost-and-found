export const CATEGORIES = {
  electronics: 'Electronics',
  'wallets-and-cards': 'Wallets & cards',
  keys: 'Keys',
  bags: 'Bags',
  clothing: 'Clothing',
  jewellery: 'Jewellery',
  documents: 'Documents',
  pets: 'Pets',
  other: 'Other',
};

export const CATEGORY_ICONS = {
  electronics: '📱',
  'wallets-and-cards': '👛',
  keys: '🔑',
  bags: '🎒',
  clothing: '🧣',
  jewellery: '💍',
  documents: '📄',
  pets: '🐾',
  other: '📦',
};

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const formatDate = (value) => (value ? dateFormat.format(new Date(value)) : '');
export const formatDateTime = (value) => (value ? dateTimeFormat.format(new Date(value)) : '');

// yyyy-mm-dd for <input type="date">
export const toDateInput = (value) => new Date(value ?? Date.now()).toISOString().slice(0, 10);

export function timeAgo(value) {
  const seconds = Math.round((Date.now() - new Date(value)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(value);
}
