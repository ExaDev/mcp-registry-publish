// The pinned mcp-publisher release this package drives, and how it is fetched. The version and the checksum of each supported asset are pinned together: a release of mcp-publisher is adopted by changing both here, so a changed asset can never be run unnoticed and "latest" can never change behaviour under a caller.
import { createHash } from "node:crypto";

export const PUBLISHER_VERSION = "1.8.1";

const PUBLISHER_REPOSITORY = "modelcontextprotocol/registry";

/** SHA-256 of each release asset this package supports, keyed `<platform>_<arch>` as the release names them. Windows is not listed: the registry's GitHub OIDC login runs on a hosted Linux or macOS runner. */
const PUBLISHER_SHA256: Readonly<Record<string, string>> = {
  linux_amd64:
    "a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc",
  linux_arm64:
    "8dd75a6cf6845688b5d4e46df58d3ca26d5c8d233bb0626606e1db82c5e883e4",
  darwin_amd64:
    "88126981225e7714fcc6b7a10cdba4a80ae5901e9740a8c06d0d5195c8bc294c",
  darwin_arm64:
    "e45e520892460732a4bdf37255576415d4a53ec171f8b913faf15bb1aef7cb77",
};

/** The binary's file name inside the release archive. */
export const PUBLISHER_BINARY = "mcp-publisher";

export interface PublisherAsset {
  readonly name: string;
  readonly url: string;
  readonly sha256: string;
}

function releaseArch(arch: string): string {
  if (arch === "x64") return "amd64";
  if (arch === "arm64") return "arm64";
  throw new Error(`Unsupported architecture: ${arch}`);
}

/** The release asset for a Node `process.platform` and `process.arch`, with its pinned checksum. Throws for a platform or architecture with no pinned asset. */
export function publisherAsset(platform: string, arch: string): PublisherAsset {
  const key = `${platform}_${releaseArch(arch)}`;
  const sha256 = PUBLISHER_SHA256[key];
  if (sha256 === undefined) {
    throw new Error(`No pinned mcp-publisher release for ${key}`);
  }
  const name = `${PUBLISHER_BINARY}_${key}.tar.gz`;
  return {
    name,
    url: `https://github.com/${PUBLISHER_REPOSITORY}/releases/download/v${PUBLISHER_VERSION}/${name}`,
    sha256,
  };
}

/** Throws unless the bytes hash to the expected SHA-256, so a tampered or truncated download is never extracted. */
export function verifySha256(
  bytes: Uint8Array,
  expected: string,
  label: string,
): void {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    throw new Error(
      `${label} has SHA-256 ${actual}, expected ${expected}; refusing to run it`,
    );
  }
}

export interface InstallDeps {
  readonly fetch: (url: string) => Promise<{
    readonly ok: boolean;
    readonly status: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
  }>;
  /** Extracts the named file from a gzip tar archive into `dir`. */
  readonly extract: (
    archive: Uint8Array,
    dir: string,
    file: string,
  ) => Promise<void>;
}

/** Downloads `asset`, verifies its checksum, extracts the binary into `dir` and returns the binary's path. Takes the asset rather than choosing it so a test can supply bytes whose checksum it knows. */
export async function installPublisher(
  dir: string,
  asset: PublisherAsset,
  deps: InstallDeps,
): Promise<string> {
  const response = await deps.fetch(asset.url);
  if (!response.ok) {
    throw new Error(
      `Downloading ${asset.url} answered ${String(response.status)}`,
    );
  }
  const archive = new Uint8Array(await response.arrayBuffer());
  verifySha256(archive, asset.sha256, asset.name);
  await deps.extract(archive, dir, PUBLISHER_BINARY);
  return `${dir}/${PUBLISHER_BINARY}`;
}
