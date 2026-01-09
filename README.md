# SwiftZero

[![License](https://img.shields.io/badge/license-MIT-green)](#) [![Platform](https://img.shields.io/badge/platform-iOS%2026%2B%20%7C%20macOS-blue)](#)

> The Universal AI Engineering Agent for Modern Swift/SwiftUI

SwiftZero is a comprehensive **Model Context Protocol (MCP) Server** that turns any AI editor (Cursor, Claude Desktop, Antigravity) into a senior iOS Engineer.

It orchestrates **12+ specialized agents**, gives them access to **19+ engineering tools**, and bridges **Apple Documentation** directly into the context window to prevent hallucinations.

## ✨ Core Capabilities

- **Universal Compatibility**: Works in Cursor, Claude Desktop, VS Code, and any MCP client.
- **Orchestrated Workflow**: The `@swift-lead` agent manages a team of specialized sub-agents (Architect, Engineer, Test Creator).
- **Integrated Toolchain**: Agents can build, test, lint, format, and boot simulators autonomously.
- **Apple Intelligence**: Connecting with the `sosumi` MCP server for instant access to 2025+ Apple Docs.
- **TCA First**: Native support for The Composable Architecture (v1.17+) and modern Swift 6.2 concurrency.

---

## 🚀 Quick Start

### 1. Install & Build

The server is written in TypeScript and runs locally.

```bash
cd mcp-server
npm install
npm run build
```

### 2. Configure Your IDE

Add the following to your MCP configuration file (e.g., `~/.cursor/mcp.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sosumi": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://sosumi.ai/mcp"]
    },
    "swift-zero": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/swift-zero/mcp-server/dist/index.js"]
    }
  }
}
```

### 3. Start Coding

Open your project and ask:

> "Act as @swift-lead. I need to build a new feature for..."

---

## 🛠️ The Agent Team

SwiftZero deploys a squad of specialists to your codebase:

| Agent                    | Proficiency                                             |
| ------------------------ | ------------------------------------------------------- |
| **@swift-lead**          | The Staff Engineer. Research, planning, and delegation. |
| **@swift-architect**     | High-level system design and decision making.           |
| **@tca-architect**       | TCA state/action modeling and reducer hierarchies.      |
| **@tca-engineer**        | Implementing reducers, effects, and dependencies.       |
| **@swiftui-specialist**  | Pure UI implementation (Views, Previews, Animations).   |
| **@swift-test-creator**  | Writing comprehensive Swift Testing suites.             |
| **@swift-code-reviewer** | Security, performance, and HIG compliance checks.       |

## 🧬 Knowledge Skills

The agents have access to 18+ knowledge bases in `.github/skills/`, covering:

- **Frameworks**: SQLite, GRDB, StoreKit 2, Network.framework
- **Patterns**: Modern Concurrency, TCA, Advanced SwiftUI
- **Platform**: iOS 26+ APIs, Human Interface Guidelines

## 🤖 Tools Available

Agents can autonomously run:

- `run_swift_build` / `run_swift_tests`
- `open_simulator` / `install_app`
- `run_swiftlint` / `run_swift_format`
- `search_apple_docs` (via Sosumi)
- `create_plan` / `update_plan_status`

---

## Architecture & Design Principles

- **Ultra-Specialization**: One agent, one job.
- **Local-First**: Default to SQLite/UserDefaults. No servers unless needed.
- **Strict Concurrency**: Swift 6.2 `Sendable` everywhere.
- **Plan-Driven**: All work is tracked in `docs/plans/<feature>.md`.

## License

MIT License. See [LICENSE](LICENSE) for details.

---

**SwiftZero** — Build better apps, faster.
