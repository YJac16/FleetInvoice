/**
 * Fleet capture permissions (`drivers:manage`, `vehicles:manage`) allow creating and
 * editing structured driver/vehicle records only. Compliance document images and signed
 * URLs remain governed by compliance-document RLS and storage policies (ops document-view
 * roles, driver self-read paths, etc.) — manage permission alone does not bypass those rules.
 */
export const COMPLIANCE_DOCUMENT_VIEW_ROLES = [
  "organisation_admin",
  "manager",
  "dispatcher",
] as const;
