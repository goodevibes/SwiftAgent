# Swift Engineering Project Guidelines

## Platform
- iOS 26.0+, Swift 6.2, strict concurrency
- SwiftUI only (no UIKit unless explicitly requested)
- TCA for complex state, vanilla Swift for simple utilities

## Conventions
- async/await exclusively (no completion handlers)
- All types crossing actor boundaries must be Sendable
- Use @MainActor for UI code
- Swift Testing framework (@Test, #expect, #require)

## Persistence
- Default: SQLite via sqlite-data skill
- Simple: UserDefaults for key-value
- Never: SwiftData, Core Data

## Workflow
1. Plan features in `docs/plans/<feature>.md`
2. Implement following the plan
3. Test all reducers and core logic
4. Code review before completion

## Skills Reference
Knowledge files are available in `.github/skills/`:
- `composable-architecture/` - TCA patterns, reducers, effects, testing
- `modern-swift/` - Concurrency, async/await, actors, Sendable
- `swiftui-patterns/` - @Observable, navigation, accessibility
- `ios-hig/` - Human Interface Guidelines
- `sqlite-data/` - @Table, migrations, CloudKit sync

## Agent Handoff Model
| From | To | Condition |
|------|----|-----------| 
| swift-ui-design | swift-architect | UI analysis complete |
| swift-architect | tca-architect | TCA chosen |
| swift-architect | swift-engineer | Vanilla Swift chosen |
| tca-architect | tca-engineer | Design complete |
| tca-engineer | swiftui-specialist | Implementation complete |
| swift-engineer | swiftui-specialist | Implementation complete |
| swiftui-specialist | swift-test-creator | Views complete |
| swift-test-creator | swift-code-reviewer | Tests written |

## Mandatory Workflow Discipline

To ensure high-quality output, you MUST follow this sequence for every major task:

### Step 1: Skill Evaluation
Evaluate relevant skills in `.github/skills/`. State: `[skill-name] - YES/NO - [reason]`.

### Step 2: Agent Delegation
Evaluate if a specialized agent should handle this sub-task. State: `[agent-name] - YES/NO - [reason]`.

### Step 3: MCP Documentation Lookup
If using modern Swift (2025) or Apple frameworks, search for latest documentation using the `sosumi` MCP server.

### Step 4: Plan Execution
Update `docs/plans/<feature>.md` before making any non-trivial code changes.
