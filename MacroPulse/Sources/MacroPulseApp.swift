import SwiftUI

@main
struct MacroPulseApp: App {
    @StateObject private var dataManager = DataManager()
    @StateObject private var socialFeedManager = SocialFeedManager()

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
