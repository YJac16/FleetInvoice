export const KEEP_SIGNED_IN_KEY = "workops-keep-signed-in";

/** Default checked — own-use app prefers staying signed in. */
export function isKeepSignedIn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (sessionStorage.getItem(KEEP_SIGNED_IN_KEY) === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function setKeepSignedIn(keepSignedIn: boolean): void {
  try {
    if (keepSignedIn) {
      localStorage.setItem(KEEP_SIGNED_IN_KEY, "1");
      sessionStorage.removeItem(KEEP_SIGNED_IN_KEY);
    } else {
      sessionStorage.setItem(KEEP_SIGNED_IN_KEY, "0");
      localStorage.removeItem(KEEP_SIGNED_IN_KEY);
    }
  } catch {
    // Storage may be unavailable in private mode.
  }
}

export function readKeepSignedInPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return sessionStorage.getItem(KEEP_SIGNED_IN_KEY) !== "0";
  } catch {
    return true;
  }
}

export function isSessionOnly(): boolean {
  return !readKeepSignedInPreference();
}
