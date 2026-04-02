import SwiftUI

enum SidebarItem: String, CaseIterable, Identifiable {
    case dashboard = "总览"
    case history = "历史趋势"
    case monetary = "货币与利率"
    case economy = "经济基本面"
    case sentiment = "市场情绪"
    case settings = "设置"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .dashboard: return "gauge.with.dots.needle.33percent"
        case .history: return "chart.xyaxis.line"
        case .monetary: return "dollarsign.circle"
        case .economy: return "chart.bar"
        case .sentiment: return "heart.text.square"
        case .settings: return "gearshape"
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var dataManager: DataManager
    @State private var selection: SidebarItem = .dashboard

    var body: some View {
        NavigationSplitView {
            List(SidebarItem.allCases, selection: $selection) { item in
                Label(item.rawValue, systemImage: item.icon)
                    .tag(item)
            }
            .listStyle(.sidebar)
            .frame(minWidth: 160)
        } detail: {
            Group {
                switch selection {
                case .dashboard:
                    DashboardView()
                case .history:
                    HistoryView()
                case .monetary:
                    CategoryDetailView(category: .monetary)
                case .economy:
                    CategoryDetailView(category: .economy)
                case .sentiment:
                    CategoryDetailView(category: .sentiment)
                case .settings:
                    SettingsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button(action: { Task { await dataManager.refreshAll() } }) {
                    if dataManager.isLoading {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("刷新数据", systemImage: "arrow.clockwise")
                    }
                }
                .disabled(dataManager.isLoading)
                .help("手动刷新所有指标数据")
            }
        }
        .navigationTitle("MacroPulse")
    }
}
