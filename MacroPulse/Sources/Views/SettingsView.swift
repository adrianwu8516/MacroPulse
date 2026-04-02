import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var dataManager: DataManager
    @State private var fredKey: String = ""
    @State private var avKey: String = ""
    @State private var showSaved = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("设置")
                    .font(.largeTitle.bold())

                // FRED API Key
                GroupBox {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("FRED API Key（必填）", systemImage: "key")
                            .font(.headline)

                        Text("用于获取利率、CPI、失业率、VIX、GDP 等数据。\n免费注册：fred.stlouisfed.org/docs/api/api_key.html")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        SecureField("输入你的 FRED API Key", text: $fredKey)
                            .textFieldStyle(.roundedBorder)

                        if dataManager.hasFREDKey {
                            Label("已设置", systemImage: "checkmark.circle.fill")
                                .foregroundColor(.green)
                                .font(.caption)
                        }
                    }
                    .padding(.vertical, 4)
                }

                // Alpha Vantage API Key
                GroupBox {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Alpha Vantage API Key（选填）", systemImage: "key")
                            .font(.headline)

                        Text("用于获取 S&P 500 价格和 200 日均线。\n免费注册：alphavantage.co/support/#api-key\n注意：免费版每天限 25 次请求")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        SecureField("输入你的 Alpha Vantage API Key", text: $avKey)
                            .textFieldStyle(.roundedBorder)

                        if dataManager.hasAVKey {
                            Label("已设置", systemImage: "checkmark.circle.fill")
                                .foregroundColor(.green)
                                .font(.caption)
                        }
                    }
                    .padding(.vertical, 4)
                }

                // 保存按钮
                HStack {
                    Button("保存 API Keys") {
                        if !fredKey.isEmpty {
                            dataManager.fredAPIKey = fredKey.trimmingCharacters(in: .whitespaces)
                        }
                        if !avKey.isEmpty {
                            dataManager.alphaVantageAPIKey = avKey.trimmingCharacters(in: .whitespaces)
                        }
                        showSaved = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            showSaved = false
                        }
                    }
                    .buttonStyle(.borderedProminent)

                    if showSaved {
                        Label("已保存！", systemImage: "checkmark")
                            .foregroundColor(.green)
                            .transition(.opacity)
                    }
                }

                Divider()

                // 使用说明
                GroupBox {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("使用说明", systemImage: "info.circle")
                            .font(.headline)

                        VStack(alignment: .leading, spacing: 8) {
                            instructionRow("1", "注册免费的 FRED API Key（必填）")
                            instructionRow("2", "可选：注册 Alpha Vantage Key 获取 S&P 500 数据")
                            instructionRow("3", "在此页面输入 Key 并保存")
                            instructionRow("4", "点击工具栏的刷新按钮获取最新数据")
                            instructionRow("5", "查看「总览」页面的综合评分和建议")
                        }
                    }
                    .padding(.vertical, 4)
                }

                // 免责声明
                GroupBox {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("免责声明", systemImage: "exclamationmark.triangle")
                            .font(.headline)
                            .foregroundColor(.orange)

                        Text("本工具仅供参考，不构成投资建议。总体经济指标的分析存在滞后性和局限性，任何投资决策应结合个人风险承受能力和专业顾问意见。过去的表现不代表未来结果。")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }
            .padding(30)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear {
            fredKey = dataManager.fredAPIKey
            avKey = dataManager.alphaVantageAPIKey
        }
    }

    func instructionRow(_ num: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(num)
                .font(.caption.bold())
                .frame(width: 20, height: 20)
                .background(Color.accentColor.opacity(0.2))
                .cornerRadius(10)
            Text(text)
                .font(.subheadline)
        }
    }
}
