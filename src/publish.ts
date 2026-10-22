// Publishes a server.json to the MCP registry the way a release job needs it done: skipping a version the registry already lists, logging in with GitHub OIDC, and retrying the failures that clear by themselves. Everything that touches the outside world (the network, the clock, the mcp-publisher process) arrives through PublishDeps, so the sequence is asserted without any of it.
import { isListedOnRegistry, registryVersionUrl } from "./registry-version.ts";
import {
  INITIAL_RETRY_DELAY_MS,
  MAX_TOTAL_RETRY_MS,
  isRetryablePublishFailure,
  nextRetryDelayMs,
} from "./retry.ts";

const MS_PER_SECOND = 1000;

export interface ServerIdentity {
  readonly name: string;
  readonly version: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The registry name and version a server.json declares. Throws when either is not a string, since the registry is asked about exactly these two values. */
export function parseServerIdentity(text: string): ServerIdentity {
  const server: unknown = JSON.parse(text);
  if (
    !isRecord(server) ||
    typeof server.name !== "string" ||
    typeof server.version !== "string"
  ) {
    throw new Error("server.json must hold a string name and version");
  }
  return { name: server.name, version: server.version };
}

export interface PublisherRun {
  /** The exit status, or null when the process was killed by a signal. */
  readonly status: number | null;
  /** Standard output and standard error together, the text the failure patterns read. */
  readonly output: string;
}

export interface PublishDeps {
  readonly fetchStatus: (url: string) => Promise<number>;
  /** Makes the mcp-publisher binary available and returns its path. */
  readonly installPublisher: () => Promise<string>;
  readonly runPublisher: (
    binary: string,
    args: readonly string[],
  ) => PublisherRun;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly log: (line: string) => void;
}

export type PublishOutcome = "already-listed" | "published";

/** The registry refused the publish with a failure a retry cannot fix, or kept failing until the retry budget ran out. */
export class PublishFailedError extends Error {
  readonly output: string;

  constructor(message: string, output: string) {
    super(message);
    this.name = "PublishFailedError";
    this.output = output;
  }
}

function login(deps: PublishDeps, binary: string): void {
  const result = deps.runPublisher(binary, ["login", "github-oidc"]);
  if (result.status !== 0) {
    throw new PublishFailedError(
      "mcp-publisher could not log in with GitHub OIDC; the job needs `permissions: id-token: write`",
      result.output,
    );
  }
}

// Logs in again before every retry, not only for the failure that needs it: a retry of an expired-token 401 can only succeed with a fresh token, and a fresh login before any other retry is harmless, so there is no need to work out which failure triggered it.
async function publishWithRetry(
  deps: PublishDeps,
  binary: string,
  serverJsonPath: string,
): Promise<void> {
  const deadline = deps.now() + MAX_TOTAL_RETRY_MS;
  let delayMs = INITIAL_RETRY_DELAY_MS;
  for (let attempt = 1; ; attempt++) {
    const result = deps.runPublisher(binary, ["publish", serverJsonPath]);
    if (result.status === 0) {
      deps.log(result.output);
      return;
    }
    const retryable =
      isRetryablePublishFailure(result.output) &&
      deps.now() + delayMs < deadline;
    if (!retryable) {
      deps.log(result.output);
      throw new PublishFailedError(
        `mcp-publisher publish failed (attempt ${String(attempt)})`,
        result.output,
      );
    }
    deps.log(
      `mcp-publisher publish hit a retryable failure (attempt ${String(attempt)}), retrying in ${String(delayMs / MS_PER_SECOND)}s`,
    );
    await deps.sleep(delayMs);
    login(deps, binary);
    delayMs = nextRetryDelayMs(delayMs);
  }
}

/** Publishes the server.json at `serverJsonPath`, whose identity is `server`, unless the registry already lists that version. */
export async function publishToRegistry(
  server: ServerIdentity,
  serverJsonPath: string,
  deps: PublishDeps,
): Promise<PublishOutcome> {
  const status = await deps.fetchStatus(
    registryVersionUrl(server.name, server.version),
  );
  if (isListedOnRegistry(status)) {
    deps.log(
      `${server.name} ${server.version} is already listed on the MCP registry`,
    );
    return "already-listed";
  }
  const binary = await deps.installPublisher();
  login(deps, binary);
  await publishWithRetry(deps, binary, serverJsonPath);
  return "published";
}
