/**
 * Warning helpers for the v2 Home data adapter.
 * @typedef {'fatal' | 'record_skipped' | 'recoverable' | 'informational'} WarningSeverity
 */

/**
 * @param {WarningSeverity} severity
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [context]
 */
export function createHomeWarning(severity, code, message, context = undefined) {
  const warning = { severity, code, message };
  if (context && Object.keys(context).length > 0) {
    warning.context = context;
  }
  return warning;
}
