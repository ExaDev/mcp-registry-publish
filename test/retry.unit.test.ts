import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INITIAL_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  MAX_TOTAL_RETRY_MS,
  isRetryablePublishFailure,
  nextRetryDelayMs,
  RETRY_BACKOFF_MULTIPLIER,
} from "../src/retry.ts";

const MULTIPLIER_WELL_BEYOND_MAX_DELAY = 10;
const MS_PER_SECOND = 1000;
// The fixed schedule of delays, in seconds, that npm's propagation lag once outlasted.
const FIRST_FIXED_DELAY_SECONDS = 15;
const SECOND_FIXED_DELAY_SECONDS = 30;
const THIRD_FIXED_DELAY_SECONDS = 60;
const FOURTH_FIXED_DELAY_SECONDS = 120;
const FIXED_SCHEDULE_THAT_RAN_OUT_SECONDS =
  FIRST_FIXED_DELAY_SECONDS +
  SECOND_FIXED_DELAY_SECONDS +
  THIRD_FIXED_DELAY_SECONDS +
  FOURTH_FIXED_DELAY_SECONDS;

describe("nextRetryDelayMs", () => {
  it("doubles the previous delay", () => {
    assert.equal(
      nextRetryDelayMs(INITIAL_RETRY_DELAY_MS),
      INITIAL_RETRY_DELAY_MS * RETRY_BACKOFF_MULTIPLIER,
    );
  });

  it("caps at the maximum delay", () => {
    assert.equal(nextRetryDelayMs(MAX_RETRY_DELAY_MS), MAX_RETRY_DELAY_MS);
    assert.equal(
      nextRetryDelayMs(MAX_RETRY_DELAY_MS * MULTIPLIER_WELL_BEYOND_MAX_DELAY),
      MAX_RETRY_DELAY_MS,
    );
  });

  it("accumulates past the fixed schedule that npm propagation lag once outlasted", () => {
    let delayMs = INITIAL_RETRY_DELAY_MS;
    let totalMs = 0;
    while (totalMs < MAX_TOTAL_RETRY_MS) {
      totalMs += delayMs;
      delayMs = nextRetryDelayMs(delayMs);
    }
    assert.ok(totalMs > FIXED_SCHEDULE_THAT_RAN_OUT_SECONDS * MS_PER_SECOND);
  });
});

describe("isRetryablePublishFailure", () => {
  it("retries the registry's npm propagation-lag text", () => {
    assert.equal(
      isRetryablePublishFailure(
        "registry validation failed for package 0 (pkg): NPM package 'pkg' exists, but version '2.18.0' was not found (status: 404). A newly published release can take a moment to appear on the registry. Wait and retry",
      ),
      true,
    );
  });

  it("retries a 5xx", () => {
    assert.equal(
      isRetryablePublishFailure(
        "Error: publish failed: server returned status 504: <html>",
      ),
      true,
    );
  });

  it("does not retry a 4xx that names no retryable cause", () => {
    assert.equal(
      isRetryablePublishFailure(
        "Error: publish failed: server returned status 400: Bad Request",
      ),
      false,
    );
  });

  it("does not retry a duplicate version, which a retry would hit again", () => {
    assert.equal(
      isRetryablePublishFailure(
        'Error: publish failed: server returned status 400: {"errors":[{"message":"invalid version: cannot publish duplicate version"}]}',
      ),
      false,
    );
  });

  it("does not misclassify an unrelated failure", () => {
    assert.equal(isRetryablePublishFailure("permission denied"), false);
  });

  it("retries connection failures that never reached the registry", () => {
    assert.equal(
      isRetryablePublishFailure(
        'Post "https://registry.example/v0/publish": dial tcp 192.0.2.1:443: i/o timeout',
      ),
      true,
    );
    assert.equal(
      isRetryablePublishFailure(
        'Post "https://registry.example/v0/publish": dial tcp 192.0.2.1:443: connect: connection refused',
      ),
      true,
    );
  });

  it("retries a 401 for an expired login token", () => {
    assert.equal(
      isRetryablePublishFailure(
        'Error: publish failed: server returned status 401: {"detail":"Invalid or expired Registry JWT token"}',
      ),
      true,
    );
  });

  it("does not retry a 401 for a credential that lacks access", () => {
    assert.equal(
      isRetryablePublishFailure(
        'Error: publish failed: server returned status 401: {"detail":"Registry JWT token does not grant publish access to this namespace"}',
      ),
      false,
    );
  });

  it("retries the registry's database running out of connection slots, reported as a 400", () => {
    assert.equal(
      isRetryablePublishFailure(
        'Error: publish failed: server returned status 400: {"detail":"Failed to publish server","errors":[{"message":"failed to begin transaction: server error: FATAL: remaining connection slots are reserved for roles with the SUPERUSER attribute (SQLSTATE 53300)"}]}',
      ),
      true,
    );
  });

  it("does not retry a database error that is not a resource shortage", () => {
    assert.equal(
      isRetryablePublishFailure(
        'Error: publish failed: server returned status 400: {"errors":[{"message":"duplicate key value violates unique constraint (SQLSTATE 23505)"}]}',
      ),
      false,
    );
  });

  it("retries the registry failing to fetch the package's metadata from npm, reported as a 400", () => {
    assert.equal(
      isRetryablePublishFailure(
        'Error: publish failed: server returned status 400: {"errors":[{"message":"registry validation failed for package 0 (pkg): failed to fetch package metadata from NPM: Get \\"https://registry.npmjs.org/pkg/1.0.0\\": context deadline exceeded (Client.Timeout exceeded while awaiting headers)"}]}',
      ),
      true,
    );
  });
});
