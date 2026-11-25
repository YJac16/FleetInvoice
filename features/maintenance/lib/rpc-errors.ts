/**
 * Maps errors from the maintenance RPCs (00074) to messages people can act
 * on. Codes come from `raise exception '<code>'`; 23505 is a unique index.
 */

export type MappedMaintenanceError = {
  error: string;
  message: string;
  field?: string;
};

const CODES: Record<string, { message: string; field?: string }> = {
  not_authorised: { message: "You don't have permission to change maintenance records." },
  module_not_entitled: { message: "Maintenance isn't included in your organisation's plan." },
  not_found: { message: "That record no longer exists." },
  invalid_payload: { message: "Some details were not valid. Check the form and try again." },
  name_required: { message: "Name is required.", field: "name" },
  bill_not_draft: { message: "Only draft bills can be deleted." },
  bill_approved_locked: { message: "This bill is final and can no longer be edited." },
  bill_has_no_lines: { message: "Add at least one line before finalising." },
  bill_already_approved: { message: "This bill is already final." },
  supplier_required: { message: "Select a supplier.", field: "supplier_id" },
  supplier_org_mismatch: { message: "That supplier isn't available.", field: "supplier_id" },
  vehicle_org_mismatch: { message: "That vehicle isn't available.", field: "vehicle_id" },
  bill_date_required: { message: "Bill date is required.", field: "bill_date" },
  invoice_ref_required: { message: "Supplier invoice number is required.", field: "invoice_ref" },
  invalid_vat_mode: { message: "Choose whether amounts include or exclude VAT.", field: "vat_mode" },
  invalid_vat_rate: { message: "VAT rate must be 0 to 100.", field: "vat_rate" },
  invalid_odometer: { message: "Odometer must be whole kilometres.", field: "odometer_km" },
  invalid_lines: { message: "Some lines were not valid." },
  category_org_mismatch: { message: "One of the categories isn't available." },
  line_description_required: { message: "Every line needs a description." },
  invalid_quantity: { message: "Quantities must be more than 0." },
  invalid_unit_amount: { message: "Amounts must be 0 or more." },
};

// Longest first so e.g. "supplier_org_mismatch" wins over "not_found".
const ORDERED = Object.keys(CODES).sort((a, b) => b.length - a.length);

export function mapMaintenanceRpcError(
  error: { message?: string | null; code?: string | null; details?: string | null } | null | undefined
): MappedMaintenanceError {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`;

  if (error?.code === "23505") {
    if (message.includes("workshop_bills_supplier_ref_uidx")) {
      return {
        error: "duplicate_invoice_ref",
        message: "This supplier already has a bill with that invoice number.",
        field: "invoice_ref",
      };
    }
    if (message.includes("suppliers_org_name_uidx")) {
      return { error: "duplicate_supplier", message: "A supplier with that name already exists.", field: "name" };
    }
    return { error: "duplicate", message: "That record already exists." };
  }
  if (error?.code === "22P02" || error?.code === "22007" || error?.code === "22008") {
    return { error: "invalid_payload", message: CODES.invalid_payload.message };
  }

  for (const code of ORDERED) {
    if (message.includes(code)) return { error: code, ...CODES[code] };
  }
  return { error: "save_failed", message: "Couldn't save. Please try again." };
}

/** Messages for the attachment route (U3) error codes. */
export function attachmentErrorMessage(code: string | undefined): string {
  switch (code) {
    case "file_too_large":
      return "The file is larger than 10 MB.";
    case "unsupported_media_type":
      return "Only PDF, JPEG, PNG or WebP files can be attached.";
    case "empty_file":
    case "file_required":
      return "Choose a file to upload.";
    case "bill_approved_locked":
      return "This bill is approved; its attachment can't be changed.";
    case "no_attachment":
      return "This bill has no attachment.";
    case "forbidden":
    case "module_not_entitled":
    case "unauthenticated":
      return "You don't have access to this attachment.";
    case "not_found":
      return "That bill no longer exists.";
    default:
      return "Something went wrong with the attachment. Please try again.";
  }
}
