/**
 * Retention is count/version based, not time based: each (subject, document type, side)
 * retains at most the current version plus one prior accepted version. The oldest prior
 * version is purged only when a second renewal creates a newer prior version (i.e. on
 * the third accepted version for that slot).
 */
export const COMPLIANCE_RETENTION_POLICY_SUMMARY =
  "count/version based, not time based: current + one prior superseded per (subject, doc_type, side)";
