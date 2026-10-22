// Parses the command line of the mcp-registry-publish binary, kept apart from the entry point so it can be asserted without running a publish.
import { parseArgs } from "node:util";

export const DEFAULT_SERVER_JSON = "server.json";

export interface CliOptions {
  readonly serverJson: string;
  readonly help: boolean;
}

export const USAGE = `Usage: mcp-registry-publish [--server-json <path>]

Publishes a server.json to the MCP registry, skipping a version the registry already lists and retrying failures that clear by themselves. Needs GitHub OIDC (\`permissions: id-token: write\`).

  --server-json <path>  The server.json to publish (default: ${DEFAULT_SERVER_JSON})
  -h, --help            Show this message
`;

/** Reads the arguments after `node <script>`. Throws on an unknown option or a stray positional argument. */
export function parseCliOptions(args: readonly string[]): CliOptions {
  const { values } = parseArgs({
    args: [...args],
    options: {
      "server-json": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });

  return {
    serverJson: values["server-json"] ?? DEFAULT_SERVER_JSON,
    help: values.help ?? false,
  };
}
