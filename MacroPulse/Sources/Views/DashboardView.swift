import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var dataManager: DataManager

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // 顶部：综合评分
                ScoreGaugeView(
                    score: dataManager.compositeScore,
                    signal: dataManager.signal
                )

                // 错误提示
                if let error = dataManager.errorMessage {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal)
                }

                // 上次更新时间
                if let date = dataManager.lastUpdated {
                    Text("上次更新：\(date.formatted(.dateTime.month().day().hour().minute()))")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                // 空状态
                if dataManager.indicators.isEmpty && !dataManager.isLoading {
                    VStack(spacing: 12) {
                        Image(systemName: "chart.bar.doc.horizontal")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary)
                        Text("尚无数据")
                            .font(.title2)
                            .foregroundColor(.secondary)
                        Text("请先在「设置」中输入 API Key，\n然后点击工具栏的刷新按钮")
                            .multilineTextAlignment(.center)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 40)
                } else {
                    // 三大类别卡片
                    LazyVGrid(columns: [
                        GridItem(.flexible(), spacing: 16),
                        GridItem(.flexible(), spacing: 16),
                        GridItem(.flexible(), spacing: 16)
                    ], spacing: 16) {
                        ForEach(IndicatorCategory.allCases) { category in
                            CategorySummaryCard(
                                category: category,
                                indicators: dataManager.indicators(for: category)
                            )
                        }
                    }
                    .padding(.horizontal)

                    // 所有指标列表
                    VStack(alignment: .leading, spacing: 12) {
                        Text("全部指标")
                            .font(.headline)
                            .padding(.horizontal)

                        ForEach(dataManager.indicators) { indicator in
                            IndicatorCardView(indicator: indicator)
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.vertical, 20)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }
}

// MARK: - 分类摘要卡片

struct CategorySummaryCard: View {
    let category: IndicatorCategory
    let indicators: [Indicator]

    var avgScore: Double {
        guard !indicators.isEmpty else { return 50 }
        return indicators.reduce(0) { $0 + $1.score } / Double(indicators.count)
    }

    var signal: SignalLevel { SignalLevel.from(score: avgScore) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: category.icon)
                    .foregroundColor(colorForScore(avgScore))
                Text(category.rawValue)
                    .font(.subheadline.bold())
                Spacer()
                Text(String(format: "%.0f分", avgScore))
                    .font(.title2.bold())
                    .foregroundColor(colorForScore(avgScore))
            }

            Divider()

            ForEach(indicators) { ind in
                HStack {
                    Circle()
                        .fill(colorForScore(ind.score))
                        .frame(width: 8, height: 8)
                    Text(ind.name)
                        .font(.caption)
                    Spacer()
                    Text(ind.displayValue)
                        .font(.caption.monospacedDigit())
                        .foregroundColor(.secondary)
                }
            }

            if indicators.isEmpty {
                Text("无数据")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(10)
        .shadow(color: .black.opacity(0.1), radius: 3, y: 2)
    }
}
