import SwiftUI
import AppKit

@main
struct MacroPulseApp: App {
    @StateObject private var dataManager = DataManager()
    @StateObject private var socialFeedManager = SocialFeedManager()

    init() {
        // 设置 Dock 图标（swift run 不走 .app bundle，需手动设置）
        if let iconURL = Bundle.module.url(forResource: "AppIcon", withExtension: "icns"),
           let icon = NSImage(contentsOf: iconURL) {
            NSApplication.shared.applicationIconImage = icon
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(dataManager)
                .environmentObject(socialFeedManager)
                .frame(minWidth: 900, minHeight: 600)
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1100, height: 750)
    }
}
