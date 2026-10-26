/**
 * Place-search feature flag. Stored per organisation in
 * `organisations.settings.place_picker` (boolean). Default OFF: only an explicit
 * `true` enables it, so no env var or deploy is needed to switch it on or off.
 * The plain pickup/drop-off text fields work whatever this returns.
 */
export const PLACE_PICKER_SETTING_KEY = "place_picker";

export function isPlacePickerEnabled(
  settings: Record<string, unknown> | null | undefined
): boolean {
  return settings?.[PLACE_PICKER_SETTING_KEY] === true;
}
