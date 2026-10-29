## [1.0.6](https://github.com/ExaDev/mcp-registry-publish/compare/v1.0.5...v1.0.6) (2026-10-22)

### Build System

- **deps-dev:** bump @exadev/eslint-config from 2.20.1 to 3.1.0 ([9aa59fd](https://github.com/ExaDev/mcp-registry-publish/commit/9aa59fdb16c831184bafa0f3af039920839720a4))

### Chores

- satisfy the padding rules in the tests ([9d226ae](https://github.com/ExaDev/mcp-registry-publish/commit/9d226aedde1948456624e76cfe458b468016d90f))
- satisfy the rules eslint-config 3 adds ([5ac37be](https://github.com/ExaDev/mcp-registry-publish/commit/5ac37be1a8ceea7a724826afff1ab6a2a764f3aa))

## [1.0.5](https://github.com/ExaDev/mcp-registry-publish/compare/v1.0.4...v1.0.5) (2026-10-22)

### Build System

- **deps:** bump actions/create-github-app-token from 3.2.0 to 3.3.0 ([9b88791](https://github.com/ExaDev/mcp-registry-publish/commit/9b8879135a16b4eb5acb841dbe894db73f1128fd))
- **deps:** bump actions/setup-node from 7.0.0 to 7.1.0 ([56d9bdf](https://github.com/ExaDev/mcp-registry-publish/commit/56d9bdf8851fefb7be26130ff02211e7491ab2ab))

## [1.0.4](https://github.com/ExaDev/mcp-registry-publish/compare/v1.0.3...v1.0.4) (2026-10-22)

### Bug Fixes

- give the harness a union type for scripted version-check answers ([90f94f3](https://github.com/ExaDev/mcp-registry-publish/commit/90f94f3e6af143c8ad074c353731015c6f852ba9))
- retry the registry version check on the publish retry budget ([937fde9](https://github.com/ExaDev/mcp-registry-publish/commit/937fde950063e5ae33badb1e3c8ebe7cd7fa46c6))

## [1.0.3](https://github.com/ExaDev/mcp-registry-publish/compare/v1.0.2...v1.0.3) (2026-10-22)

### Bug Fixes

- log the registry's output with each retried failure ([c5f0ab6](https://github.com/ExaDev/mcp-registry-publish/commit/c5f0ab65464f7214d13dc677ce55ad7915ef621e))

## [1.0.2](https://github.com/ExaDev/mcp-registry-publish/compare/v1.0.1...v1.0.2) (2026-10-22)

### Continuous Integration

- keep the pinned actions and dependencies current with Dependabot ([6ff3248](https://github.com/ExaDev/mcp-registry-publish/commit/6ff324810c2b91819ac71370716bb551bd38d570))

## [1.0.1](https://github.com/ExaDev/mcp-registry-publish/compare/v1.0.0...v1.0.1) (2026-10-22)

### Documentation

- describe the release layout and the Marketplace listing ([9f04379](https://github.com/ExaDev/mcp-registry-publish/commit/9f04379776cec831a802002a6a197c346d2250ca))

### Code Refactoring

- **release:** stop creating a GitHub release for the moving major tag ([60d15c8](https://github.com/ExaDev/mcp-registry-publish/commit/60d15c8a7699d47589893f3a06d31553786c56d0))

## 1.0.0 (2026-10-22)

### Features

- classify the registry's publish failures that clear by themselves ([27c6c61](https://github.com/ExaDev/mcp-registry-publish/commit/27c6c61d18edb091087a9b44ce28fd65b1b7676b))
- install a pinned, checksum-verified mcp-publisher ([af9fea0](https://github.com/ExaDev/mcp-registry-publish/commit/af9fea02d1131fdc0a7eb267ea178f9d470e4cc0))
- publish a server.json with login and retry, as a library and a command ([eeb2103](https://github.com/ExaDev/mcp-registry-publish/commit/eeb21033128ae4a5e217c70ca551c7aae1dd055b))
- run the publisher as a composite GitHub Action ([4fff882](https://github.com/ExaDev/mcp-registry-publish/commit/4fff8822c3b9d36d7550adf2ad6b5ebd17f441db))
- skip a version the registry already lists ([8d5f427](https://github.com/ExaDev/mcp-registry-publish/commit/8d5f4278404c1c58b191552c2920454e0e78b587))
