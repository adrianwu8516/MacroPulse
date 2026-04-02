import SwiftUI
import Charts

struct CategoryDetailView: View {
    @EnvironmentObject var dataManager: DataManager
    let category: IndicatorCategory

    var indicators: [Indicator] {
        dataManager.indicators(for: category)
    }

    var avgScore: Double {
        guard !indicators.isEmpty else { return 50 }
        return indicators.reduce(0) { $0 + $1.score } / Double(indicators.count)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // 标题与分类平均分
                HStack {
                    Image(systemName: category.icon)
                        .font(.title)
                        .foregroundColor(colorForScore(avgScore))
                    VStack(alignment: .leading) {
                        Text(category.rawValue)
                            .font(.title.bold())
                        Text("权重：\(Int(category.weight * 100))% | 平均分：\(String(format: "%.0f", avgScore))")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()

                    // 分数徽章
                    Text(String(format: "%.0f", avgScore))
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .foregroundColor(colorForScore(avgScore))
                }
                .padding()

                // 趋势图（仅 sentiment 类别展示 VIX 历史）
                if category == .sentiment && !dataManager.vixHistory.isEmpty {
                    chartSection(title: "VIX 历史趋势", data: dataManager.vixHistory)
                }

                if category == .monetary && !dataManager.yieldSpreadHistory.isEmpty {
                    chartSection(title: "殖利率曲线利差 (10Y-2Y) 历史", data: dataManager.yieldSpreadHistory)
                }

                // 指标列表
                VStack(spacing: 12) {
                    ForEach(indicators) { indicator in
                        IndicatorCardView(indicator: indicator)
                    }
                }
                .padding(.horizontal)

                if indicators.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "questionmark.circle")
                            .font(.system(size: 40))
                            .foregroundColor(.secondary)
                        Text("暂无 \(category.rawValue) 数据")
                            .foregroundColor(.secondary)
                        Text("请点击工具栏刷新按钮获取数据")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 40)
                }

                // 解读说明
                interpretationSection
            }
            .padding(.vertical)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    @ViewBuilder
    func chartSection(title: String, data: [IndicatorSnapshot]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .padding(.horizontal)

            Chart(data) { point in
                LineMark(
                    x: .value("日期", point.date),
                    y: .value("值", point.value)
                )
                .foregroundStyle(.blue)
                .interpolationMethod(.catmullRom)

                AreaMark(
                    x: .value("日期", point.date),
                    y: .value("值", point.value)
                )
                .foregroundStyle(.blue.opacity(0.1))
                .interpolationMethod(.catmullRom)
            }
            .frame(height: 200)
            .padding(.horizontal)
        }
        .padding()
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(10)
        .padding(.horizontal)
    }

    @ViewBuilder
    var interpretationSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("指标解读")
                .font(.headline)

            switch category {
            case .monetary:
                Text("""
                • 联邦基金利率：Fed 降息周期利好股市，升息压制估值
                • 殖利率曲线：10Y-2Y 利差为正表示经济健康；反转（负值）是衰退的可靠预警，历史准确率 87.5%
                • 10年期国债：当殖利率过高（>4.5%），资金从股市流向债券
                """)
            case .economy:
                Text("""
                • CPI：温和通胀（2-3%）最理想；过高促使 Fed 升息，过低暗示需求不足
                • 失业率：低失业率支撑消费支出和企业盈利
                • PMI：>50 表示制造业扩张，是经济前瞻性指标
                • GDP：正增长显示经济活力，连续两季负增长定义为技术性衰退
                """)
            case .sentiment:
                Text("""
                • VIX：<18 为低波动环境；>28 进入恐慌区域
                • 恐惧贪婪指数：采用逆向策略 — 极度恐惧（<25）往往是买入机会，极度贪婪（>80）则需警惕
                • S&P 500 趋势：高于 200 日均线为多头格局，低于则可能进入调整

                引用 Warren Buffett: "在别人恐惧时贪婪，在别人贪婪时恐惧"
                """)
            }
        }
        .font(.subheadline)
        .foregroundColor(.secondary)
        .padding()
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(10)
        .padding(.horizontal)
    }
}
