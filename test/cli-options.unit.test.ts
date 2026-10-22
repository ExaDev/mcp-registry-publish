import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SERVER_JSON, parseCliOptions } from "../src/cli-options.ts";

describe("parseCliOptions", () => {
  it("defaults to server.json in the working directory", () => {
    assert.deepEqual(parseCliOptions([]), {
      serverJson: DEFAULT_SERVER_JSON,
      help: false,
    });
  });

  it("reads --server-json", () => {
    assert.equal(
      parseCliOptions(["--server-json", "dist/server.json"]).serverJson,
      "dist/server.json",
    );
  });

  it("reads --help and -h", () => {
    assert.equal(parseCliOptions(["--help"]).help, true);
    assert.equal(parseCliOptions(["-h"]).help, true);
  });

  it("rejects an unknown option", () => {
    assert.throws(() => parseCliOptions(["--no-such-option"]));
  });

  it("rejects a stray positional argument", () => {
    assert.throws(() => parseCliOptions(["server.json"]));
  });
});
