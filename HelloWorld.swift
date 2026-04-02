import SwiftUI

@main
struct HelloWorldApp: App {
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
            Text("Hello, World!")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Welcome to your first Mac app!")
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
