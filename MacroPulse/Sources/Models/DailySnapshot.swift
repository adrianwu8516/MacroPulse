import Foundation

// MARK: - 每日快照

struct DailySnapshot: Codable, Identifiable {
    let id: UUID
    let date: Date              // 标准化到当天 00:00
    let compositeScore: Double
    let signalLevel: String     // SignalLevel.rawValue
    let indicators: [IndicatorRecord]

    struct IndicatorRecord: Codable, Identifiable {
        let id: String          // e.g. "FEDFUNDS"
        let name: String
        let category: String    // IndicatorCategory.rawValue
        let rawValue: Double?
        let displayValue: String
        let score: Double
        let trend: String
    }

    init(date: Date, compositeScore: Double, signalLevel: String, indicators: [IndicatorRecord]) {
        self.id = UUID()
        self.date = Calendar.current.startOfDay(for: date)
        self.compositeScore = compositeScore
        self.signalLevel = signalLevel
        self.indicators = indicators
    }

    /// 从当前 Indicator 数组构建 IndicatorRecord
    static func records(from indicators: [Indicator]) -> [IndicatorRecord] {
        indicators.map { ind in
            IndicatorRecord(
                id: ind.id,
                name: ind.name,
                category: ind.category.rawValue,
                rawValue: ind.rawValue,
                displayValue: ind.displayValue,
                score: ind.score,
                trend: ind.trend
            )
        }
    }
}
