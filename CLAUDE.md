# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This repo contains two projects:
- **HelloWorld** — A standalone single-file SwiftUI demo app (HelloWorld.swift, pre-compiled binary)
- **MacroPulse** — A macOS financial dashboard app (Swift Package Manager project)

MacroPulse is the main project.

## Build & Run Commands

```bash
# Build MacroPulse
cd MacroPulse && swift build

# Run MacroPulse
cd MacroPulse && swift run

# Build HelloWorld (standalone)
swiftc -o HelloWorld HelloWorld.swift -framework SwiftUI -framework AppKit
```

MacroPulse uses Swift Package Manager with no external dependencies. Target platform: macOS 14+, Swift 5.9.

## MacroPulse Architecture

**Data flow:** Views → DataManager → Services → APIs → ScoreEngine → UI

### Layers

- **Models** (`Sources/Models/`): `Indicator` (data struct + enums for category/signal), `ScoreEngine` (pure static scoring functions with hardcoded thresholds)
- **Services** (`Sources/Services/`): Three `actor`-based API clients (`FREDService`, `FearGreedService`, `MarketDataService`) + `DataManager` (`@MainActor ObservableObject` that orchestrates all fetching and state)
- **Views** (`Sources/Views/`): SwiftUI views using `NavigationSplitView` with sidebar routing via `SidebarItem` enum

### Key Design Patterns

- **Concurrency:** All services are Swift `actor` types; DataManager is `@MainActor`; async/await throughout with parallel `async let` for independent fetches
- **State:** DataManager holds all `@Published` state and is injected as `.environmentObject`; API keys persisted via `@AppStorage`
- **Scoring:** Category weights are Monetary 30%, Economy 30%, Sentiment 40% (defined in `IndicatorCategory` enum). ScoreEngine uses contrarian logic for Fear & Greed (fear = buy signal). All thresholds are hardcoded piecewise ranges.
- **Error handling:** Partial success — individual indicator failures are collected and shown as warnings, not fatal errors

### External APIs

| Service | API | Auth |
|---------|-----|------|
| FREDService | FRED (St. Louis Fed) | API key required |
| MarketDataService | Alpha Vantage | API key optional (25 req/day free) |
| FearGreedService | CNN Fear & Greed | None (public endpoint, User-Agent spoofed) |

API keys are configured in the Settings view and stored in UserDefaults.
