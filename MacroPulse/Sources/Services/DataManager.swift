import SwiftUI

// MARK: - 数据管理器

@MainActor
class DataManager: ObservableObject {
    @Published var indicators: [Indicator] = []
    @Published var compositeScore: Double = 50
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var lastUpdated: Date?

    // API Keys (stored in UserDefaults)
    @AppStorage("fredAPIKey") var fredAPIKey = ""
    @AppStorage("alphaVantageAPIKey") var alphaVantageAPIKey = ""

    // VIX 历史数据（用于图表）
    @Published var vixHistory: [IndicatorSnapshot] = []
    @Published var yieldSpreadHistory: [IndicatorSnapshot] = []

    // 历史快照
    @Published var history: [DailySnapshot] = []

    private let fredService = FREDService()
    private let fearGreedService = FearGreedService()
    private let marketDataService = MarketDataService()
    private let historyStore = HistoryStore()

    var hasFREDKey: Bool { !fredAPIKey.trimmingCharacters(in: .whitespaces).isEmpty }
    var hasAVKey: Bool { !alphaVantageAPIKey.trimmingCharacters(in: .whitespaces).isEmpty }

    // MARK: - 加载历史

    func loadHistory() async {
        history = await historyStore.load()
    }

    // MARK: - 刷新所有数据

    func refreshAll() async {
        isLoading = true
        errorMessage = nil
        var newIndicators: [Indicator] = []
        var errors: [String] = []

        // --- 货币与利率 ---
        if hasFREDKey {
            // 1. Fed 利率
            do {
                let (current, previous) = try await fredService.fetchRecentTwo(seriesID: "FEDFUNDS", apiKey: fredAPIKey)
                let score = ScoreEngine.scoreFedRate(current: current, previous: previous)
                let trend = current < previous ? "↓" : (current > previous ? "↑" : "→")
                newIndicators.append(Indicator(
                    id: "FEDFUNDS", name: "联邦基金利率", category: .monetary,
                    rawValue: current, displayValue: String(format: "%.2f%%", current),
                    score: score, trend: trend,
                    description: "Fed 基准利率，降息利好股市"
                ))
            } catch {
                errors.append("Fed利率: \(error.localizedDescription)")
            }

            // 2. 10Y-2Y 利差
            do {
                let spread = try await fredService.fetchLatestValue(seriesID: "T10Y2Y", apiKey: fredAPIKey)
                let score = ScoreEngine.scoreYieldSpread(spread: spread)
                newIndicators.append(Indicator(
                    id: "T10Y2Y", name: "殖利率曲线 (10Y-2Y)", category: .monetary,
                    rawValue: spread, displayValue: String(format: "%+.2f%%", spread),
                    score: score, trend: spread > 0 ? "↑" : "↓",
                    description: "正斜率=健康，反转=衰退警告"
                ))
                // 获取历史
                yieldSpreadHistory = (try? await fredService.fetchHistory(seriesID: "T10Y2Y", apiKey: fredAPIKey)) ?? []
            } catch {
                errors.append("利差: \(error.localizedDescription)")
            }

            // 3. 10Y 国债殖利率
            do {
                let yield10Y = try await fredService.fetchLatestValue(seriesID: "DGS10", apiKey: fredAPIKey)
                let score = ScoreEngine.score10YYield(yield10Y: yield10Y)
                newIndicators.append(Indicator(
                    id: "DGS10", name: "10年期国债殖利率", category: .monetary,
                    rawValue: yield10Y, displayValue: String(format: "%.2f%%", yield10Y),
                    score: score, trend: "→",
                    description: "长期利率，过高压制股市估值"
                ))
            } catch {
                errors.append("10Y: \(error.localizedDescription)")
            }

            // --- 经济基本面 ---

            // 4. CPI
            do {
                let (current, previous) = try await fredService.fetchRecentTwo(seriesID: "CPIAUCSL", apiKey: fredAPIKey)
                // 计算年化增长率 (月度数据，简化为月增率 * 12)
                let monthlyChange = (current - previous) / previous * 100
                let annualized = monthlyChange * 12
                let score = ScoreEngine.scoreCPI(yoy: annualized)
                newIndicators.append(Indicator(
                    id: "CPI", name: "CPI 通胀率", category: .economy,
                    rawValue: annualized, displayValue: String(format: "%.1f%%", annualized),
                    score: score, trend: annualized > 3 ? "↑" : "→",
                    description: "消费者物价指数年增率"
                ))
            } catch {
                errors.append("CPI: \(error.localizedDescription)")
            }

            // 5. 失业率
            do {
                let rate = try await fredService.fetchLatestValue(seriesID: "UNRATE", apiKey: fredAPIKey)
                let score = ScoreEngine.scoreUnemployment(rate: rate)
                newIndicators.append(Indicator(
                    id: "UNRATE", name: "失业率", category: .economy,
                    rawValue: rate, displayValue: String(format: "%.1f%%", rate),
                    score: score, trend: "→",
                    description: "美国失业率，低=经济强劲"
                ))
            } catch {
                errors.append("失业率: \(error.localizedDescription)")
            }

            // 6. ISM PMI (使用制造业就业作为代理)
            do {
                let pmi = try await fredService.fetchLatestValue(seriesID: "NAPM", apiKey: fredAPIKey)
                let score = ScoreEngine.scorePMI(pmi: pmi)
                newIndicators.append(Indicator(
                    id: "PMI", name: "ISM 制造业 PMI", category: .economy,
                    rawValue: pmi, displayValue: String(format: "%.1f", pmi),
                    score: score, trend: pmi > 50 ? "↑" : "↓",
                    description: ">50 扩张，<50 收缩"
                ))
            } catch {
                errors.append("PMI: \(error.localizedDescription)")
            }

            // 7. GDP
            do {
                let (current, previous) = try await fredService.fetchRecentTwo(seriesID: "GDP", apiKey: fredAPIKey)
                let growth = (current - previous) / previous * 100 * 4  // 季度年化
                let score = ScoreEngine.scoreGDP(growth: growth)
                newIndicators.append(Indicator(
                    id: "GDP", name: "GDP 增长率", category: .economy,
                    rawValue: growth, displayValue: String(format: "%.1f%%", growth),
                    score: score, trend: growth > 0 ? "↑" : "↓",
                    description: "国内生产总值季度年化增长"
                ))
            } catch {
                errors.append("GDP: \(error.localizedDescription)")
            }

            // --- 市场情绪 ---

            // 8. VIX
            do {
                let vix = try await fredService.fetchLatestValue(seriesID: "VIXCLS", apiKey: fredAPIKey)
                let score = ScoreEngine.scoreVIX(vix: vix)
                newIndicators.append(Indicator(
                    id: "VIX", name: "VIX 恐慌指数", category: .sentiment,
                    rawValue: vix, displayValue: String(format: "%.1f", vix),
                    score: score, trend: vix > 20 ? "↑" : "↓",
                    description: "市场波动率，<18 低波动，>28 恐慌"
                ))
                // VIX 历史
                vixHistory = (try? await fredService.fetchHistory(seriesID: "VIXCLS", apiKey: fredAPIKey)) ?? []
            } catch {
                errors.append("VIX: \(error.localizedDescription)")
            }
        } else {
            errors.append("请设置 FRED API Key")
        }

        // 9. CNN Fear & Greed
        do {
            let fg = try await fearGreedService.fetchCurrent()
            let score = ScoreEngine.scoreFearGreed(index: fg.score)
            newIndicators.append(Indicator(
                id: "FG", name: "恐惧与贪婪指数", category: .sentiment,
                rawValue: fg.score, displayValue: String(format: "%.0f (%@)", fg.score, fg.rating),
                score: score, trend: fg.score < 40 ? "↓" : (fg.score > 60 ? "↑" : "→"),
                description: "CNN 指数，逆向操作：极度恐惧=买入"
            ))
        } catch {
            errors.append("恐惧贪婪: \(error.localizedDescription)")
        }

        // 10. S&P 500 趋势
        if hasAVKey {
            do {
                async let priceTask = marketDataService.fetchSPYPrice(apiKey: alphaVantageAPIKey)
                async let smaTask = marketDataService.fetchSMA200(apiKey: alphaVantageAPIKey)
                let price = try await priceTask
                let sma = try await smaTask
                let score = ScoreEngine.scoreSP500Trend(currentPrice: price, ma200: sma)
                let aboveMA = price > sma
                newIndicators.append(Indicator(
                    id: "SP500", name: "S&P 500 趋势", category: .sentiment,
                    rawValue: price, displayValue: String(format: "$%.0f (%@ 200MA)", price, aboveMA ? "高于" : "低于"),
                    score: score, trend: aboveMA ? "↑" : "↓",
                    description: "SPY 相对 200 日均线位置"
                ))
            } catch {
                errors.append("S&P500: \(error.localizedDescription)")
            }
        }

        // 更新状态
        indicators = newIndicators
        compositeScore = ScoreEngine.compositeScore(from: newIndicators)
        lastUpdated = Date()

        if !errors.isEmpty && newIndicators.isEmpty {
            errorMessage = errors.joined(separator: "\n")
        } else if !errors.isEmpty {
            errorMessage = "部分数据获取失败：\(errors.count) 项"
        }

        // 保存今日快照
        if !newIndicators.isEmpty {
            let todaySnapshot = DailySnapshot(
                date: Date(),
                compositeScore: compositeScore,
                signalLevel: signal.rawValue,
                indicators: DailySnapshot.records(from: newIndicators)
            )
            await historyStore.save(snapshot: todaySnapshot)

            // 补齐历史
            if hasFREDKey {
                await backfillHistory()
            }

            // 重新加载历史
            history = await historyStore.load()
        }

        isLoading = false
    }

    // MARK: - 补齐历史数据

    private func backfillHistory() async {
        let missing = await historyStore.missingDates(inLast: 30)
        guard !missing.isEmpty else { return }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        // 批量拉取 FRED 各指标的历史数据
        // 日频: T10Y2Y, DGS10, VIXCLS
        // 月频: FEDFUNDS, CPIAUCSL, UNRATE, NAPM
        // 季频: GDP
        let seriesIDs = ["T10Y2Y", "DGS10", "VIXCLS", "FEDFUNDS", "CPIAUCSL", "UNRATE", "NAPM", "GDP"]
        var allMaps: [String: [String: Double]] = [:]

        for sid in seriesIDs {
            if let map = try? await fredService.fetchHistoryMap(seriesID: sid, apiKey: fredAPIKey, limit: 90) {
                allMaps[sid] = map
            }
        }

        // 对月频/季频指标，建立 forward-fill 查找表
        // 对每个日期，找到最近的可用值
        func lookupValue(seriesID: String, dateStr: String, date: Date) -> Double? {
            guard let map = allMaps[seriesID] else { return nil }
            // 先精确匹配
            if let val = map[dateStr] { return val }
            // 往前找最近的值（最多回溯 90 天）
            let cal = Calendar.current
            for offset in 1...90 {
                guard let earlier = cal.date(byAdding: .day, value: -offset, to: date) else { break }
                let key = formatter.string(from: earlier)
                if let val = map[key] { return val }
            }
            return nil
        }

        // 为每个缺失日期构建快照
        var backfilled: [DailySnapshot] = []

        for date in missing {
            let dateStr = formatter.string(from: date)
            var dayIndicators: [Indicator] = []

            // Fed 利率（需要两个点来计算趋势）
            if let current = lookupValue(seriesID: "FEDFUNDS", dateStr: dateStr, date: date) {
                // 简化：用当前值作为 previous 的近似（月频数据变化小）
                let score = ScoreEngine.scoreFedRate(current: current, previous: current)
                dayIndicators.append(Indicator(
                    id: "FEDFUNDS", name: "联邦基金利率", category: .monetary,
                    rawValue: current, displayValue: String(format: "%.2f%%", current),
                    score: score, trend: "→",
                    description: "Fed 基准利率，降息利好股市"
                ))
            }

            // 10Y-2Y 利差
            if let spread = lookupValue(seriesID: "T10Y2Y", dateStr: dateStr, date: date) {
                let score = ScoreEngine.scoreYieldSpread(spread: spread)
                dayIndicators.append(Indicator(
                    id: "T10Y2Y", name: "殖利率曲线 (10Y-2Y)", category: .monetary,
                    rawValue: spread, displayValue: String(format: "%+.2f%%", spread),
                    score: score, trend: spread > 0 ? "↑" : "↓",
                    description: "正斜率=健康，反转=衰退警告"
                ))
            }

            // 10Y 国债殖利率
            if let yield10Y = lookupValue(seriesID: "DGS10", dateStr: dateStr, date: date) {
                let score = ScoreEngine.score10YYield(yield10Y: yield10Y)
                dayIndicators.append(Indicator(
                    id: "DGS10", name: "10年期国债殖利率", category: .monetary,
                    rawValue: yield10Y, displayValue: String(format: "%.2f%%", yield10Y),
                    score: score, trend: "→",
                    description: "长期利率，过高压制股市估值"
                ))
            }

            // 失业率
            if let rate = lookupValue(seriesID: "UNRATE", dateStr: dateStr, date: date) {
                let score = ScoreEngine.scoreUnemployment(rate: rate)
                dayIndicators.append(Indicator(
                    id: "UNRATE", name: "失业率", category: .economy,
                    rawValue: rate, displayValue: String(format: "%.1f%%", rate),
                    score: score, trend: "→",
                    description: "美国失业率，低=经济强劲"
                ))
            }

            // ISM PMI
            if let pmi = lookupValue(seriesID: "NAPM", dateStr: dateStr, date: date) {
                let score = ScoreEngine.scorePMI(pmi: pmi)
                dayIndicators.append(Indicator(
                    id: "PMI", name: "ISM 制造业 PMI", category: .economy,
                    rawValue: pmi, displayValue: String(format: "%.1f", pmi),
                    score: score, trend: pmi > 50 ? "↑" : "↓",
                    description: ">50 扩张，<50 收缩"
                ))
            }

            // VIX
            if let vix = lookupValue(seriesID: "VIXCLS", dateStr: dateStr, date: date) {
                let score = ScoreEngine.scoreVIX(vix: vix)
                dayIndicators.append(Indicator(
                    id: "VIX", name: "VIX 恐慌指数", category: .sentiment,
                    rawValue: vix, displayValue: String(format: "%.1f", vix),
                    score: score, trend: vix > 20 ? "↑" : "↓",
                    description: "市场波动率，<18 低波动，>28 恐慌"
                ))
            }

            // 至少有 3 个指标才算有意义的快照
            guard dayIndicators.count >= 3 else { continue }

            let composite = ScoreEngine.compositeScore(from: dayIndicators)
            let signalLevel = SignalLevel.from(score: composite)

            backfilled.append(DailySnapshot(
                date: date,
                compositeScore: composite,
                signalLevel: signalLevel.rawValue,
                indicators: DailySnapshot.records(from: dayIndicators)
            ))
        }

        if !backfilled.isEmpty {
            await historyStore.saveMultiple(newSnapshots: backfilled)
        }
    }

    // MARK: - 分类指标

    func indicators(for category: IndicatorCategory) -> [Indicator] {
        indicators.filter { $0.category == category }
    }

    var signal: SignalLevel {
        SignalLevel.from(score: compositeScore)
    }
}
