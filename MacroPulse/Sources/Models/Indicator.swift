import Foundation

// MARK: - 指标类别
enum IndicatorCategory: String, CaseIterable, Identifiable {
    case monetary = "货币与利率"
    case economy = "经济基本面"
    case sentiment = "市场情绪"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .monetary: return "dollarsign.circle"
        case .economy: return "chart.bar"
        case .sentiment: return "heart.text.square"
        }
    }

    var weight: Double {
        switch self {
        case .monetary: return 0.30
        case .economy: return 0.30
        case .sentiment: return 0.40
        }
    }
}

// MARK: - 信号等级
enum SignalLevel: String {
    case strongBuy = "强力买入"
    case buy = "适合买入"
    case neutral = "中性观望"
    case caution = "谨慎减仓"
    case riskOff = "高风险回避"

    var emoji: String {
        switch self {
        case .strongBuy: return "🟢"
        case .buy: return "🟢"
        case .neutral: return "🟡"
        case .caution: return "🟠"
        case .riskOff: return "🔴"
        }
    }

    static func from(score: Double) -> SignalLevel {
        switch score {
        case 75...100: return .strongBuy
        case 55..<75: return .buy
        case 40..<55: return .neutral
        case 25..<40: return .caution
        default: return .riskOff
        }
    }
}

// MARK: - 单个指标
struct Indicator: Identifiable {
    let id: String          // e.g. "FEDFUNDS"
    let name: String        // e.g. "联邦基金利率"
    let category: IndicatorCategory
    var rawValue: Double?
    var displayValue: String    // 格式化后的显示值
    var score: Double           // 0-100 标准化分数
    var trend: String           // "↑" "↓" "→"
    var description: String     // 简要说明

    var signal: SignalLevel {
        SignalLevel.from(score: score)
    }
}

// MARK: - 指标快照（用于图表历史）
struct IndicatorSnapshot: Identifiable, Codable {
    let id: UUID
    let date: Date
    let value: Double

    init(date: Date, value: Double) {
        self.id = UUID()
        self.date = date
        self.value = value
    }
}
