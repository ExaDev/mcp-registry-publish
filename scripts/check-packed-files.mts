// Fails unless the npm package would contain the files its manifest points consumers at. `npm pack --dry-run` lists what a publish would ship, so a `files` entry or an ignore rule that drops the binary or the library entry fails here and not in a consumer's install. Run after the build, since the entries are build output.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!isRecord(value)) return [];

  return Object.values(value).flatMap(stringValues);
}

const manifest: unknown = JSON.parse(readFileSync("package.json", "utf8"));
if (!isRecord(manifest)) throw new Error("package.json is not an object");

// Every path the manifest names for `bin` and `exports`, as the package-relative paths npm lists.
const needed = [
  ...stringValues(manifest.bin),
  ...stringValues(manifest.exports),
]
  .filter((entry) => entry.startsWith("./"))
  .map((entry) => entry.slice(2));
if (needed.length === 0)
  throw new Error("package.json names no bin or exports");

const listing: unknown = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
  }),
);
const files =
  Array.isArray(listing) &&
  isRecord(listing[0]) &&
  Array.isArray(listing[0].files)
    ? listing[0].files.flatMap((file: unknown) =>
        isRecord(file) && typeof file.path === "string" ? [file.path] : [],
      )
    : [];

const missing = needed.filter((entry) => !files.includes(entry));
if (missing.length > 0) {
  console.error(`The package would not contain: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(
  `The package contains all ${String(needed.length)} entries its manifest names`,
);
