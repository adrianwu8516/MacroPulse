import SwiftUI
import AppKit

@main
struct MacroPulseApp: App {
    init() {
        // Set Dock icon programmatically
        let iconPaths = [
            Bundle.main.path(forResource: "AppIcon", ofType: "icns"),
            (ProcessInfo.processInfo.arguments.first.flatMap { URL(fileURLWithPath: $0).deletingLastPathComponent().appendingPathComponent("../Resources/AppIcon.icns").path }),
            // Fallback: look next to the executable
            (ProcessInfo.processInfo.arguments.first.flatMap { URL(fileURLWithPath: $0).deletingLastPathComponent().appendingPathComponent("AppIcon.icns").path })
        ]
        for path in iconPaths {
            if let p = path, FileManager.default.fileExists(atPath: p),
               let icon = NSImage(contentsOfFile: p) {
                NSApplication.shared.applicationIconImage = icon
                break
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @State private var clickCount = 0

    var body: some View {
        VStack(spacing: 20) {
            Text("MacroPulse")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Welcome to MacroPulse!")
                .font(.title2)
                .foregroundColor(.secondary)

            Button("Click me! (\(clickCount))") {
                clickCount += 1
            }
            .font(.title3)
            .buttonStyle(.borderedProminent)
        }
        .frame(width: 400, height: 300)
        .padding()
    }
}
