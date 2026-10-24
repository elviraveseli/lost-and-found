// User input placed in a RegExp must be escaped, otherwise characters like ".*"
// change the meaning of the query and long patterns can cause slow matching.
export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
