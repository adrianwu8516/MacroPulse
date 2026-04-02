import SwiftUI

struct IndicatorCardView: View {
    let indicator: Indicator

    var body: some View {
        HStack(spacing: 16) {
            // 左侧：分数圆
            ZStack {
                Circle()
                    .stroke(colorForScore(indicator.score).opacity(0.3), lineWidth: 4)
                    .frame(width: 44, height: 44)
                Circle()
                    .trim(from: 0, to: indicator.score / 100)
                    .stroke(colorForScore(indicator.score), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 44, height: 44)
                Text(String(format: "%.0f", indicator.score))
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundColor(colorForScore(indicator.score))
            }

            // 中间：名称和说明
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(indicator.name)
                        .font(.subheadline.bold())
                    Text(indicator.trend)
                        .font(.subheadline)
                }
                Text(indicator.description)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            // 右侧：当前值
            VStack(alignment: .trailing, spacing: 3) {
                Text(indicator.displayValue)
                    .font(.system(.body, design: .monospaced))
                    .bold()
                Text(indicator.signal.rawValue)
                    .font(.caption2)
                    .foregroundColor(colorForScore(indicator.score))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(colorForScore(indicator.score).opacity(0.15))
                    .cornerRadius(4)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(8)
    }
}
