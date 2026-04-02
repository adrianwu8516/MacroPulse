import SwiftUI
import Charts

struct HistoryView: View {
    @EnvironmentObject var dataManager: DataManager

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // 标题
                HStack {
                    Image(systemName: "chart.xyaxis.line")
                        .font(.title)
                        .foregroundColor(.accentColor)
                    VStack(alignment: .leading) {
                        Text("历史趋势")
                            .font(.title.bold())
                        Text("综合评分每日变动")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()

                    if let latest = dataManager.history.last {
                        VStack(alignment: .trailing) {
                            Text(String(format: "%.0f", latest.compositeScore))
                                .font(.system(size: 36, weight: .bold, design: .rounded))
                                .foregroundColor(colorForScore(latest.compositeScore))
                            Text(latest.signalLevel)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(.horizontal)

                if dataManager.history.isEmpty {
                    emptyState
                } else {
                    scoreChart
                    signalTimeline
                    snapshotList
                }
            }
            .padding(.vertical, 20)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .task {
            await dataManager.loadHistory()
        }
    }

    // MARK: - 综合评分趋势图

    @ViewBuilder
    var scoreChart: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("综合评分趋势")
                .font(.headline)
                .padding(.horizontal)

            Chart(dataManager.history) { snap in
                LineMark(
                    x: .value("日期", snap.date),
                    y: .value("评分", snap.compositeScore)
                )
                .foregroundStyle(.blue)
                .interpolationMethod(.catmullRom)
                .lineStyle(StrokeStyle(lineWidth: 2))

                AreaMark(
                    x: .value("日期", snap.date),
                    y: .value("评分", snap.compositeScore)
                )
                .foregroundStyle(
                    .linearGradient(
                        colors: [.blue.opacity(0.2), .blue.opacity(0.02)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .interpolationMethod(.catmullRom)

                PointMark(
                    x: .value("日期", snap.date),
                    y: .value("评分", snap.compositeScore)
                )
                .foregroundStyle(colorForScore(snap.compositeScore))
                .symbolSize(snap.id == dataManager.history.last?.id ? 60 : 20)
            }
            .chartYScale(domain: 0...100)
            .chartYAxis {
                AxisMarks(values: [0, 25, 40, 55, 75, 100]) { value in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5, dash: [4]))
                    AxisValueLabel {
                        if let v = value.as(Int.self) {
                            Text("\(v)")
                                .font(.caption2)
                        }
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: .day, count: 7)) { _ in
                    AxisGridLine()
                    AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                }
            }
            .frame(height: 250)
            .padding(.horizontal)

            // 图例区间
            HStack(spacing: 16) {
                legendItem(color: .green, label: "强力买入 (75-100)")
                legendItem(color: Color(red: 0.2, green: 0.7, blue: 0.3), label: "适合买入 (55-74)")
                legendItem(color: .orange, label: "中性观望 (40-54)")
                legendItem(color: Color(red: 0.9, green: 0.5, blue: 0.1), label: "谨慎减仓 (25-39)")
                legendItem(color: .red, label: "高风险 (<25)")
            }
            .font(.caption2)
            .padding(.horizontal)
        }
        .padding()
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(10)
        .padding(.horizontal)
    }

    func legendItem(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label).foregroundColor(.secondary)
        }
    }

    // MARK: - 信号时间轴

    @ViewBuilder
    var signalTimeline: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("信号变化")
                .font(.headline)
                .padding(.horizontal)

            let changes = signalChanges
            if changes.isEmpty {
                Text("暂无信号变化记录")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .padding(.horizontal)
            } else {
                ForEach(changes, id: \.date) { change in
                    HStack(spacing: 12) {
                        Circle()
                            .fill(colorForScore(change.score))
                            .frame(width: 12, height: 12)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(change.date.formatted(.dateTime.year().month().day()))
                                .font(.subheadline.bold())
                            Text("\(change.signal)  (\(String(format: "%.0f", change.score))分)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        Spacer()

                        if let prev = change.previousSignal {
                            Text("\(prev) → \(change.signal)")
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(colorForScore(change.score).opacity(0.15))
                                .cornerRadius(8)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 4)
                }
            }
        }
        .padding()
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(10)
        .padding(.horizontal)
    }

    struct SignalChange {
        let date: Date
        let signal: String
        let score: Double
        let previousSignal: String?
    }

    var signalChanges: [SignalChange] {
        let sorted = dataManager.history.sorted { $0.date < $1.date }
        var changes: [SignalChange] = []
        var lastSignal: String?

        for snap in sorted {
            if snap.signalLevel != lastSignal {
                changes.append(SignalChange(
                    date: snap.date,
                    signal: snap.signalLevel,
                    score: snap.compositeScore,
                    previousSignal: lastSignal
                ))
                lastSignal = snap.signalLevel
            }
        }
        return changes.reversed() // 最新的在上面
    }

    // MARK: - 每日快照列表

    @ViewBuilder
    var snapshotList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("每日记录")
                .font(.headline)
                .padding(.horizontal)

            let sorted = dataManager.history.sorted { $0.date > $1.date }
            ForEach(sorted.prefix(30)) { snap in
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(snap.indicators) { ind in
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
                                Text(String(format: "%.0f分", ind.score))
                                    .font(.caption.bold())
                                    .foregroundColor(colorForScore(ind.score))
                            }
                        }
                    }
                    .padding(.vertical, 4)
                } label: {
                    HStack {
                        Text(snap.date.formatted(.dateTime.year().month().day().weekday(.abbreviated)))
                            .font(.subheadline)
                        Spacer()
                        Text(String(format: "%.0f分", snap.compositeScore))
                            .font(.subheadline.bold())
                            .foregroundColor(colorForScore(snap.compositeScore))
                        Text(snap.signalLevel)
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(colorForScore(snap.compositeScore).opacity(0.15))
                            .cornerRadius(6)
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding()
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(10)
        .padding(.horizontal)
    }

    // MARK: - 空状态

    @ViewBuilder
    var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text("暂无历史数据")
                .font(.title2)
                .foregroundColor(.secondary)
            Text("点击工具栏的刷新按钮获取数据，\n系统会自动保存每日快照并补齐过去的记录")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
        }
        .padding(.top, 60)
    }
}
