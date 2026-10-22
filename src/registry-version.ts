// Decides whether a version is already listed on the MCP registry. Publishing a version the registry already holds fails, so a re-run of a publish that an outage interrupted has to skip the version it completed, and a backfill of a listed version has to be a no-op.

export const REGISTRY_BASE_URL = "https://registry.modelcontextprotocol.io";
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

/** The registry's endpoint for one version of one server. The name carries a `/` (`io.github.<owner>/<repo>`) that must stay inside a single path segment. */
export function registryVersionUrl(name: string, version: string): string {
  return `${REGISTRY_BASE_URL}/v0/servers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`;
}

/** Reads the status of a {@link registryVersionUrl} response: 200 means listed, 404 means not listed. Any other status says nothing about whether the version is listed, so it throws and fails the run to be re-run, never guessing either way. */
export function isListedOnRegistry(status: number): boolean {
  if (status === HTTP_OK) return true;
  if (status === HTTP_NOT_FOUND) return false;
  throw new Error(
    `The MCP registry answered ${String(status)} when asked whether the version is listed`,
  );
}
