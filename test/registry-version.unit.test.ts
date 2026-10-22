import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isListedOnRegistry,
  registryVersionUrl,
} from "../src/registry-version.ts";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_BAD_GATEWAY = 502;

describe("registryVersionUrl", () => {
  it("encodes the namespace separator so the server name stays one path segment", () => {
    assert.equal(
      registryVersionUrl("io.github.example/server", "1.2.3"),
      "https://registry.modelcontextprotocol.io/v0/servers/io.github.example%2Fserver/versions/1.2.3",
    );
  });
});

describe("isListedOnRegistry", () => {
  it("treats a 200 as listed", () => {
    assert.equal(isListedOnRegistry(HTTP_OK), true);
  });

  it("treats a 404 as not listed, which is what makes a missed publish detectable", () => {
    assert.equal(isListedOnRegistry(HTTP_NOT_FOUND), false);
  });

  it("refuses to guess from any other status", () => {
    assert.throws(() => isListedOnRegistry(HTTP_BAD_GATEWAY), /502/);
  });
});
