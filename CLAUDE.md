# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

- **MacroPulse** — The main project: a macOS financial dashboard + social feed tracker (Swift Package Manager)
- **HelloWorld** — A standalone single-file SwiftUI demo (HelloWorld.swift, pre-compiled binary)

## Build & Run Commands

```bash
# Build MacroPulse
cd MacroPulse && swift build

# Run MacroPulse
cd MacroPulse && swift run

# Package as .app bundle
cd MacroPulse && chmod +x build.sh && ./build.sh

# Build HelloWorld (standalone)
swiftc -o HelloWorld HelloWorld.swift -framework SwiftUI -framework AppKit
```

MacroPulse uses Swift Package Manager with no external dependencies. Target platform: macOS 14+, Swift 5.9.

## MacroPulse Architecture

**Two independent feature domains** sharing the same app shell:

1. **Macro Dashboard** — Fetches US macro indicators, scores them, shows buy/hold/risk signals
2. **Social Feed** — Tracks X (Twitter) and Threads accounts, aggregates posts with engagement metrics

Both domains inject their own `@MainActor ObservableObject` manager via `.environmentObject` from the app entry point.

### Data Flow

```
Views → DataManager → Services (actor) → External APIs → ScoreEngine → UI
Views → SocialFeedManager → XService / ThreadsService (actor) → External APIs → UI
```

### Key Design Patterns

- **Concurrency:** All API services are Swift `actor` types; managers are `@MainActor`; `async/await` with parallel `async let` for independent fetches
- **State:** `DataManager` and `SocialFeedManager` hold all `@Published` state; API keys persisted via `@AppStorage` in UserDefaults
- **Scoring:** Category weights — Monetary 30%, Economy 30%, Sentiment 40%. ScoreEngine uses contrarian logic for Fear & Greed (fear = buy signal). All thresholds are hardcoded piecewise ranges.
- **Error handling:** Partial success — individual indicator/account failures are collected and shown as warnings, not fatal errors
- **Persistence:** Financial history → `~/Library/Application Support/MacroPulse/history.json`; Social accounts → `social_accounts.json` in same directory

### External APIs

| Service | API | Auth |
|---------|-----|------|
| FREDService | FRED (St. Louis Fed) | API key required |
| MarketDataService | Alpha Vantage | API key optional (25 req/day free) |
| FearGreedService | CNN Fear & Greed | None (public endpoint) |
| XService | X API v2 | Bearer token required |
| ThreadsService | Meta Graph API | Access token required (only own posts) |

API keys are configured in the Settings view and stored in UserDefaults.

### Dock Icon Workaround

The app entry point manually sets `NSApplication.shared.applicationIconImage` from `Bundle.module` resources because `swift run` doesn't read `.app` bundle metadata. This is intentional for development.
