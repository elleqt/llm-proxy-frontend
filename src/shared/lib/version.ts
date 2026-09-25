/** Build version baked in at build time: semver tag, edge-<sha>, sha, or "dev" locally. */
export function appVersion(): string {
  return import.meta.env.VITE_APP_VERSION || "dev";
}
