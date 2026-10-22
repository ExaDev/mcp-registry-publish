#!/usr/bin/env node
// The mcp-registry-publish binary, and the entry point of the GitHub Action: wires the real network, clock and mcp-publisher process into publishToRegistry. The action runs this file straight from its checkout, so it uses only syntax Node can strip types from.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseCliOptions, USAGE } from "./cli-options.ts";
import { installPublisher, publisherAsset } from "./publisher-binary.ts";
import {
  parseServerIdentity,
  publishToRegistry,
  PublishFailedError,
  type PublishDeps,
} from "./publish.ts";

const REQUEST_TIMEOUT_MS = 30_000;

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function extractFromArchive(
  archive: Uint8Array,
  dir: string,
  file: string,
): Promise<void> {
  const result = spawnSync("tar", ["-xzf", "-", "-C", dir, file], {
    input: archive,
  });
  if (result.status !== 0) {
    return Promise.reject(
      new Error(`tar could not extract ${file}: ${String(result.stderr)}`),
    );
  }

  return Promise.resolve();
}

function realDeps(downloadDir: string): PublishDeps {
  return {
    fetchStatus: async (url) =>
      (await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }))
        .status,
    installPublisher: async () =>
      installPublisher(
        downloadDir,
        publisherAsset(process.platform, process.arch),
        {
          fetch: async (url) =>
            fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
          extract: extractFromArchive,
        },
      ),
    runPublisher: (binary, args) => {
      const result = spawnSync(binary, [...args], { encoding: "utf8" });

      return {
        status: result.status,
        output: `${result.stdout}${result.stderr}`,
      };
    },
    sleep,
    now: Date.now,
    log: (line) => {
      console.log(line);
    },
  };
}

async function main(): Promise<number> {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);

    return 0;
  }
  const server = parseServerIdentity(readFileSync(options.serverJson, "utf8"));
  const downloadDir = mkdtempSync(path.join(tmpdir(), "mcp-registry-publish-"));
  try {
    await publishToRegistry(server, options.serverJson, realDeps(downloadDir));

    return 0;
  } finally {
    rmSync(downloadDir, { recursive: true, force: true });
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof PublishFailedError) console.error(error.output);
  process.exitCode = 1;
}
