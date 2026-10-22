// The MCP registry fails in ways that clear by themselves, and several of them arrive as an HTTP 400 that says nothing about the request. This module decides which publish failures are worth another attempt and how long to wait, kept apart from the publishing code so each decision can be asserted deterministically. Every pattern below was met in a real release run, not guessed.

export const INITIAL_RETRY_DELAY_MS = 15_000;
export const MAX_RETRY_DELAY_MS = 120_000;
export const RETRY_BACKOFF_MULTIPLIER = 2;
const MAX_TOTAL_RETRY_MINUTES = 15;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

/**
 * A fixed 225 second schedule was exhausted by npm's CDN not yet serving a version published seconds earlier, so the budget is a quarter of an hour of doubling delays capped at two minutes.
 */
export const MAX_TOTAL_RETRY_MS =
  MAX_TOTAL_RETRY_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

/** The next delay in the doubling-with-cap backoff schedule, given the delay just used. */
export function nextRetryDelayMs(previousDelayMs: number): number {
  return Math.min(
    previousDelayMs * RETRY_BACKOFF_MULTIPLIER,
    MAX_RETRY_DELAY_MS,
  );
}

// The registry validates a publish against npm, where the version published seconds earlier may not be visible yet, and its error text says to wait and retry.
function isNpmPropagationLag(output: string): boolean {
  return (
    output.includes("was not found") &&
    output.includes("A newly published release can take a moment")
  );
}

// Any 5xx is the registry's own server failing to complete the request, not this side asking for something wrong.
const SERVER_ERROR_STATUS_PATTERN = /server returned status 5\d{2}\b/;

function isServerError(output: string): boolean {
  return SERVER_ERROR_STATUS_PATTERN.test(output);
}

// The request never produced an HTTP response: a DNS, dial, timeout or reset failure in mcp-publisher's own client, so there is no status line to match.
const CONNECTION_ERROR_PATTERN =
  /\b(?:dial tcp|i\/o timeout|connection refused|connection reset|no such host)\b/;

function isConnectionError(output: string): boolean {
  return CONNECTION_ERROR_PATTERN.test(output);
}

// The login token can expire during a long retry window and then 401s on every attempt. It is retryable only because the caller logs in again before each retry, and only the "expired" 401 qualifies: a 401 for a wrongly scoped credential would fail again however fresh the token is.
const UNAUTHORISED_STATUS_PATTERN = /server returned status 401\b/;

function isExpiredToken(output: string): boolean {
  return UNAUTHORISED_STATUS_PATTERN.test(output) && output.includes("expired");
}

// PostgreSQL's SQLSTATE class 53 is "insufficient resources" (no connection slots, disk full, out of memory): a shortage on the registry's side that clears by itself. The registry reported it as an HTTP 400, so the 5xx pattern never matched. Any other SQLSTATE class, such as a constraint violation, describes the request and would fail again.
const DATABASE_RESOURCE_SHORTAGE_PATTERN = /\bSQLSTATE 53\d{3}\b/;

function isDatabaseResourceShortage(output: string): boolean {
  return DATABASE_RESOURCE_SHORTAGE_PATTERN.test(output);
}

// The registry validates a publish by fetching the package's metadata from npm itself, and reported a timeout in that call as an HTTP 400. Its own outbound call failing says nothing about this request, whatever cause it names.
function isNpmMetadataFetchFailure(output: string): boolean {
  return output.includes("failed to fetch package metadata from NPM");
}

/** Whether mcp-publisher's output describes a failure a retry can fix: npm propagation lag, a 5xx, a connection failure, an expired login token, the registry's database or its call to npm failing. Anything else, an invalid request or a duplicate version for instance, would fail again. */
export function isRetryablePublishFailure(output: string): boolean {
  return (
    isNpmPropagationLag(output) ||
    isServerError(output) ||
    isConnectionError(output) ||
    isExpiredToken(output) ||
    isDatabaseResourceShortage(output) ||
    isNpmMetadataFetchFailure(output)
  );
}
