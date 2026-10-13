export function parseSemver(version: string): {
  major: number;
  minor: number;
  patch: number;
} {
  const cleaned = version.replace(/^[^\d]*/, "").split("-")[0] ?? "";
  const [major, minor, patch] = cleaned.split(".").map((part) => Number(part));
  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
    patch: Number.isFinite(patch) ? patch : 0,
  };
}

export function semverAtLeast(
  version: string,
  minMajor: number,
  minMinor: number
): boolean {
  const v = parseSemver(version);
  return (
    v.major > minMajor || (v.major === minMajor && v.minor >= minMinor)
  );
}
