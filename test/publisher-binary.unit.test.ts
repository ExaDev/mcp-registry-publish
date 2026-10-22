import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  installPublisher,
  PUBLISHER_BINARY,
  PUBLISHER_VERSION,
  publisherAsset,
  verifySha256,
  type InstallDeps,
  type PublisherAsset,
} from "../src/publisher-binary.ts";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const SHA256_HEX_LENGTH = 64;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("publisherAsset", () => {
  it("names the release asset and pins its checksum for every supported platform", () => {
    for (const [platform, arch, expectedName] of [
      ["linux", "x64", "mcp-publisher_linux_amd64.tar.gz"],
      ["linux", "arm64", "mcp-publisher_linux_arm64.tar.gz"],
      ["darwin", "x64", "mcp-publisher_darwin_amd64.tar.gz"],
      ["darwin", "arm64", "mcp-publisher_darwin_arm64.tar.gz"],
    ] as const) {
      const asset = publisherAsset(platform, arch);
      assert.equal(asset.name, expectedName);
      assert.equal(
        asset.url,
        `https://github.com/modelcontextprotocol/registry/releases/download/v${PUBLISHER_VERSION}/${expectedName}`,
      );
      assert.match(asset.sha256, /^[0-9a-f]+$/);
      assert.equal(asset.sha256.length, SHA256_HEX_LENGTH);
    }
  });

  it("refuses an architecture with no release", () => {
    assert.throws(() => publisherAsset("linux", "ia32"), /ia32/);
  });

  it("refuses a platform with no pinned asset", () => {
    assert.throws(() => publisherAsset("win32", "x64"), /win32_amd64/);
  });
});

describe("verifySha256", () => {
  const bytes = new TextEncoder().encode("archive");

  it("accepts bytes that hash to the expected value", () => {
    verifySha256(bytes, sha256(bytes), "archive");
  });

  it("rejects bytes that do not, naming both hashes", () => {
    const wrong = "0".repeat(SHA256_HEX_LENGTH);
    assert.throws(
      () => {
        verifySha256(bytes, wrong, "archive");
      },
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(sha256(bytes)) &&
        error.message.includes(wrong),
    );
  });
});

describe("installPublisher", () => {
  const archive = new TextEncoder().encode("pretend tarball");
  const asset: PublisherAsset = {
    name: "pretend.tar.gz",
    url: "https://example.invalid/pretend.tar.gz",
    sha256: sha256(archive),
  };

  function depsFor(
    status: number,
    body: Uint8Array,
    onExtract: (path: string) => void,
  ): InstallDeps {
    return {
      fetch: async (url) => {
        assert.equal(url, asset.url);
        return Promise.resolve({
          ok: status === HTTP_OK,
          status,
          arrayBuffer: async () => Promise.resolve(bufferOf(body)),
        });
      },
      extract: async (_archive, dir, file) => {
        onExtract(`${dir}/${file}`);
        return Promise.resolve();
      },
    };
  }

  it("extracts a verified download and returns the binary's path", async () => {
    const extracted: string[] = [];
    const binary = await installPublisher(
      "/work",
      asset,
      depsFor(HTTP_OK, archive, (path) => {
        extracted.push(path);
      }),
    );
    assert.equal(binary, `/work/${PUBLISHER_BINARY}`);
    assert.deepEqual(extracted, [`/work/${PUBLISHER_BINARY}`]);
  });

  it("never extracts a download whose checksum differs", async () => {
    const extracted: string[] = [];
    await assert.rejects(
      installPublisher(
        "/work",
        asset,
        depsFor(HTTP_OK, new TextEncoder().encode("tampered"), (path) => {
          extracted.push(path);
        }),
      ),
      /refusing to run it/,
    );
    assert.deepEqual(extracted, []);
  });

  it("fails on a download the server refused", async () => {
    const extracted: string[] = [];
    await assert.rejects(
      installPublisher(
        "/work",
        asset,
        depsFor(HTTP_NOT_FOUND, archive, (path) => {
          extracted.push(path);
        }),
      ),
      /404/,
    );
    assert.deepEqual(extracted, []);
  });
});
