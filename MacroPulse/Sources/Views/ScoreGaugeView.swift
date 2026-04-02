import SwiftUI

struct ScoreGaugeView: View {
    let score: Double
    let signal: SignalLevel

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                // 背景弧
                Circle()
                    .trim(from: 0.15, to: 0.85)
                    .stroke(Color.gray.opacity(0.2), style: StrokeStyle(lineWidth: 20, lineCap: .round))
                    .rotationEffect(.degrees(90))
                    .frame(width: 200, height: 200)

                // 彩色弧
                Circle()
                    .trim(from: 0.15, to: 0.15 + 0.7 * score / 100)
                    .stroke(
                        AngularGradient(
                            gradient: Gradient(colors: [.red, .orange, .yellow, .green]),
                            center: .center,
                            startAngle: .degrees(144),
                            endAngle: .degrees(396)
                        ),
                        style: StrokeStyle(lineWidth: 20, lineCap: .round)
                    )
                    .rotationEffect(.degrees(90))
                    .frame(width: 200, height: 200)

                // 分数
                VStack(spacing: 4) {
                    Text(String(format: "%.0f", score))
                        .font(.system(size: 52, weight: .bold, design: .rounded))
                        .foregroundColor(colorForScore(score))
                    Text("/ 100")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            // 信号标签
            HStack(spacing: 8) {
                Circle()
                    .fill(colorForScore(score))
                    .frame(width: 12, height: 12)
                Text(signal.rawValue)
                    .font(.title3.bold())
                    .foregroundColor(colorForScore(score))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
            .background(colorForScore(score).opacity(0.15))
            .cornerRadius(20)

            // 说明
            Text(signalDescription)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .padding(.vertical, 10)
    }

    var signalDescription: String {
        switch signal {
        case .strongBuy:
            return "多数指标显示有利条件，宏观环境强劲支持买入"
        case .buy:
            return "整体环境偏向积极，可考虑适度布局"
        case .neutral:
            return "宏观信号混合，建议观望等待更清晰的方向"
        case .caution:
            return "部分指标转弱，建议谨慎操作，控制仓位"
        case .riskOff:
            return "多数指标显示风险偏高，建议降低风险暴露"
        }
    }
}

// MARK: - 全局颜色辅助

func colorForScore(_ score: Double) -> Color {
    switch score {
    case 75...100: return .green
    case 55..<75: return Color(red: 0.2, green: 0.7, blue: 0.3)
    case 40..<55: return .orange
    case 25..<40: return Color(red: 0.9, green: 0.5, blue: 0.1)
    default: return .red
    }
}
