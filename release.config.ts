import type { Options } from "semantic-release";

type ReleaseLevel = "major" | "minor" | "patch" | false;

interface CommitType {
  readonly type: string;
  readonly release: ReleaseLevel;
  /** The heading this type's commits are listed under in the release notes and CHANGELOG.md. */
  readonly section: string;
}

/**
 * The conventional-commit types this repository accepts, and the release level each one triggers. commitlint.config.ts imports this so its type-enum rule and commit-analyzer's releaseRules below can never drift apart — a commit type either exists here, or it fails commit-msg validation and never reaches a release decision. Every type here is also listed in the release notes, so a release is never cut by a commit that its own notes omit.
 */
export const commitTypes: readonly CommitType[] = [
  { type: "feat", release: "minor", section: "Features" },
  { type: "fix", release: "patch", section: "Bug Fixes" },
  { type: "docs", release: "patch", section: "Documentation" },
  { type: "refactor", release: "patch", section: "Code Refactoring" },
  { type: "perf", release: "patch", section: "Performance Improvements" },
  { type: "test", release: "patch", section: "Tests" },
  { type: "build", release: "patch", section: "Build System" },
  { type: "ci", release: "patch", section: "Continuous Integration" },
  { type: "chore", release: "patch", section: "Chores" },
  { type: "revert", release: "patch", section: "Reverts" },
];

/**
 * Runs on push to main. Analyses commits since the last v* tag, computes the next version, generates release notes and a CHANGELOG.md entry, creates the GitHub Release and the version tag, and commits CHANGELOG.md back to main. There is no npm-publish step: this repository ships a GitHub Action, not an npm package. ./scripts/move-major-tag.mts then moves the major tag (`v1`) to the new release, since semantic-release has no concept of that and consuming repositories pin to `@v1`. The major tag is a plain tag with no GitHub Release of its own: GitHub's action versioning guidance is one release per specific version (each one published to the Marketplace) and a major tag moved by force push, and a release on the moving tag would lock it where immutable releases are enabled.
 */
const config: Options = {
  branches: ["main"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          { breaking: true, release: "major" },
          ...commitTypes.map((t) => ({ type: t.type, release: t.release })),
        ],
      },
    ],
    // conventional-changelog-conventionalcommits is a direct dependency pinned to 9.x, and pnpm-workspace.yaml makes it a dependency of release-notes-generator too, which resolves the preset from its own directory first, so the 10.x copy that @commitlint/config-conventional pulls in is not used: release-notes-generator loads conventional-changelog-writer 8, and the 10.x preset needs writer 9, so it renders a bare version header instead of notes. With 9.x, presetConfig.types lists every type in commitTypes under its section, which the angular preset cannot (it lists only feat, fix, perf and revert, so a release cut by a docs, refactor, ci or chore commit had a version header and nothing under it). The version header is always H2, so the file's only H1 stays this repository's own "# Changelog" title.
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig: {
          types: commitTypes.map((t) => ({
            type: t.type,
            section: t.section,
          })),
        },
      },
    ],
    "@semantic-release/changelog",
    // A plugin file, not an npm package: runs in the prepare step, which executes in plugin-list order, so placing it here -- after @semantic-release/changelog writes CHANGELOG.md and before @semantic-release/git commits it -- formats the generated file so it passes format:check. See the plugin's own docstring for why this is a local plugin rather than a flag on @semantic-release/changelog (which has none).
    "./scripts/format-changelog.mts",
    // OIDC trusted publishing with provenance (publishConfig in package.json); needs `id-token: write` and a trusted publisher registered for this package on npm. Runs before the GitHub release so a failed publish leaves no release without its package.
    "@semantic-release/npm",
    "@semantic-release/github",
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md"],
        message: "chore(release): ${nextRelease.version} [skip ci]",
      },
    ],
    // A plugin file, not an npm dependency: referenced by path so Options.plugins' own PluginSpec type (string | [string, T]) is satisfied without a cast. See the plugin's own docstring for why this exists as local code rather than a package.
    "./scripts/move-major-tag.mts",
    // A plugin file, not an npm dependency, for the same reason. Runs after the tag move so the release it edits points at the moved tag.
    "./scripts/add-compare-link.mts",
  ],
};

export default config;
