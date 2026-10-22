import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseServerIdentity,
  PublishFailedError,
  publishToRegistry,
  type PublishDeps,
  type PublisherRun,
} from "../src/publish.ts";
import {
  INITIAL_RETRY_DELAY_MS,
  MAX_TOTAL_RETRY_MS,
  nextRetryDelayMs,
} from "../src/retry.ts";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_BAD_GATEWAY = 502;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const SERVER = { name: "io.github.example/server", version: "1.2.3" };
const SERVER_JSON = "server.json";
const BINARY = "/work/mcp-publisher";

const SUCCESS: PublisherRun = { status: 0, output: "ok" };
const REGISTRY_UNAVAILABLE: PublisherRun = {
  status: 1,
  output: "Error: publish failed: server returned status 503: unavailable",
};
const DUPLICATE_VERSION: PublisherRun = {
  status: 1,
  output:
    'Error: publish failed: server returned status 400: {"errors":[{"message":"invalid version: cannot publish duplicate version"}]}',
};

interface Harness {
  readonly deps: PublishDeps;
  /** Every external effect in the order it happened. */
  readonly calls: string[];
  readonly sleeps: number[];
  readonly logs: string[];
}

/** Fakes for everything outside the sequence. `runs` answers mcp-publisher's `publish` invocations in order; `login` is the answer to every `login`. The clock advances only through `sleep`, so the retry budget is spent deterministically. */
function harness(
  options: {
    readonly runs: readonly PublisherRun[];
    readonly login?: PublisherRun;
  } & (
    | { readonly status: number }
    | {
        /** Answers to the version checks in order: a number resolves with that status, an Error rejects with it. */
        readonly statuses: readonly (number | Error)[];
      }
  ),
): Harness {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const remaining = [...options.runs];
  const remainingStatuses = [
    ...("statuses" in options ? options.statuses : []),
  ];
  let clock = 0;
  const deps: PublishDeps = {
    fetchStatus: async (url) => {
      calls.push(`fetch ${url}`);
      const next = remainingStatuses.shift();
      if (next !== undefined) {
        if (next instanceof Error) return Promise.reject(next);
        return Promise.resolve(next);
      }
      assert.ok(
        "status" in options,
        "the scripted version-check answers ran out",
      );
      return Promise.resolve(options.status);
    },
    installPublisher: async () => {
      calls.push("install");
      return Promise.resolve(BINARY);
    },
    runPublisher: (binary, args) => {
      assert.equal(binary, BINARY);
      calls.push(args.join(" "));
      if (args[0] === "login") return options.login ?? SUCCESS;
      const next = remaining.shift();
      assert.ok(
        next !== undefined,
        "mcp-publisher ran more often than scripted",
      );
      return next;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
    log: (line) => {
      logs.push(line);
    },
  };
  return { deps, calls, sleeps, logs };
}

describe("publishToRegistry", () => {
  it("does nothing for a version the registry already lists", async () => {
    const h = harness({ status: HTTP_OK, runs: [] });
    assert.equal(
      await publishToRegistry(SERVER, SERVER_JSON, h.deps),
      "already-listed",
    );
    assert.equal(h.calls.length, 1);
    assert.match(
      h.calls[0] ?? "",
      /^fetch .*io\.github\.example%2Fserver\/versions\/1\.2\.3$/,
    );
    assert.match(h.logs.join("\n"), /already listed/);
  });

  it("installs, logs in and publishes a version the registry does not list", async () => {
    const h = harness({ status: HTTP_NOT_FOUND, runs: [SUCCESS] });
    assert.equal(
      await publishToRegistry(SERVER, SERVER_JSON, h.deps),
      "published",
    );
    assert.deepEqual(h.calls.slice(1), [
      "install",
      "login github-oidc",
      `publish ${SERVER_JSON}`,
    ]);
    assert.deepEqual(h.sleeps, []);
  });

  it("retries the version check when the registry times out, then publishes once it answers", async () => {
    const h = harness({
      statuses: [
        new Error("The operation was aborted due to timeout"),
        HTTP_NOT_FOUND,
      ],
      runs: [SUCCESS],
    });
    assert.equal(
      await publishToRegistry(SERVER, SERVER_JSON, h.deps),
      "published",
    );
    assert.match(h.calls[0] ?? "", /^fetch /);
    assert.match(h.calls[1] ?? "", /^fetch /);
    assert.equal(h.sleeps.length, 1);
  });

  it("retries the version check when the registry answers an unexpected status, then publishes once it answers", async () => {
    const h = harness({
      statuses: [HTTP_INTERNAL_SERVER_ERROR, HTTP_NOT_FOUND],
      runs: [SUCCESS],
    });
    assert.equal(
      await publishToRegistry(SERVER, SERVER_JSON, h.deps),
      "published",
    );
    assert.match(h.calls[0] ?? "", /^fetch /);
    assert.match(h.calls[1] ?? "", /^fetch /);
    assert.equal(h.sleeps.length, 1);
  });

  it("fails without publishing when the registry cannot say whether the version is listed even across the whole retry budget", async () => {
    const h = harness({ status: HTTP_BAD_GATEWAY, runs: [] });
    await assert.rejects(publishToRegistry(SERVER, SERVER_JSON, h.deps), /502/);
    assert.ok(h.calls.length > 1, "the version check was retried");
    assert.ok(
      h.calls.every((call) => call.startsWith("fetch ")),
      "nothing installed, logged in or published",
    );
  });

  it("logs in again before each retry and backs off", async () => {
    const h = harness({
      status: HTTP_NOT_FOUND,
      runs: [REGISTRY_UNAVAILABLE, REGISTRY_UNAVAILABLE, SUCCESS],
    });
    assert.equal(
      await publishToRegistry(SERVER, SERVER_JSON, h.deps),
      "published",
    );
    assert.deepEqual(h.calls.slice(1), [
      "install",
      "login github-oidc",
      `publish ${SERVER_JSON}`,
      "login github-oidc",
      `publish ${SERVER_JSON}`,
      "login github-oidc",
      `publish ${SERVER_JSON}`,
    ]);
    assert.deepEqual(h.sleeps, [
      INITIAL_RETRY_DELAY_MS,
      nextRetryDelayMs(INITIAL_RETRY_DELAY_MS),
    ]);
  });

  it("logs the registry's output for each failure it retries, so the cause of a slow publish can be read afterwards", async () => {
    const h = harness({
      status: HTTP_NOT_FOUND,
      runs: [REGISTRY_UNAVAILABLE, SUCCESS],
    });
    await publishToRegistry(SERVER, SERVER_JSON, h.deps);
    assert.ok(
      h.logs.some((line) => line.includes(REGISTRY_UNAVAILABLE.output)),
      "the retried failure's output is logged",
    );
  });

  it("fails at once on a failure a retry cannot fix, with the registry's output", async () => {
    const h = harness({ status: HTTP_NOT_FOUND, runs: [DUPLICATE_VERSION] });
    await assert.rejects(
      publishToRegistry(SERVER, SERVER_JSON, h.deps),
      (error: unknown) =>
        error instanceof PublishFailedError &&
        error.output === DUPLICATE_VERSION.output,
    );
    assert.deepEqual(h.sleeps, []);
  });

  it("gives up once the retry budget is spent", async () => {
    const h = harness({
      status: HTTP_NOT_FOUND,
      runs: Array.from({ length: 100 }, () => REGISTRY_UNAVAILABLE),
    });
    await assert.rejects(
      publishToRegistry(SERVER, SERVER_JSON, h.deps),
      PublishFailedError,
    );
    const slept = h.sleeps.reduce((total, ms) => total + ms, 0);
    assert.ok(slept <= MAX_TOTAL_RETRY_MS, `slept ${String(slept)} ms`);
    assert.ok(h.sleeps.length > 1, "it retried before giving up");
  });

  it("fails when the OIDC login fails, naming the permission it needs", async () => {
    const h = harness({
      status: HTTP_NOT_FOUND,
      runs: [],
      login: { status: 1, output: "no token" },
    });
    await assert.rejects(
      publishToRegistry(SERVER, SERVER_JSON, h.deps),
      /id-token: write/,
    );
  });
});

describe("parseServerIdentity", () => {
  it("reads the name and version", () => {
    assert.deepEqual(
      parseServerIdentity(
        '{"name":"io.github.example/server","version":"1.2.3"}',
      ),
      SERVER,
    );
  });

  it("rejects a server.json without a string name and version", () => {
    assert.throws(
      () => parseServerIdentity('{"name":"x"}'),
      /string name and version/,
    );
    assert.throws(
      () => parseServerIdentity('{"name":"x","version":1}'),
      /string name and version/,
    );
    assert.throws(() => parseServerIdentity("[]"), /string name and version/);
  });
});
