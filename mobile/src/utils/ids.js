/**
 * ID generation utilities
 */

export function generateSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
