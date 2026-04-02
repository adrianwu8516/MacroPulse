import Foundation

struct ScoreEngine {

    // MARK: - 综合评分

    /// 计算加权综合分数
    static func compositeScore(from indicators: [Indicator]) -> Double {
        var categoryScores: [IndicatorCategory: (total: Double, count: Int)] = [:]

        for indicator in indicators where indicator.rawValue != nil {
            let existing = categoryScores[indicator.category] ?? (0, 0)
            categoryScores[indicator.category] = (existing.total + indicator.score, existing.count + 1)
        }

        var weighted = 0.0
        var totalWeight = 0.0

        for (category, data) in categoryScores where data.count > 0 {
            let avg = data.total / Double(data.count)
            weighted += avg * category.weight
            totalWeight += category.weight
        }

        guard totalWeight > 0 else { return 50 }
        return min(100, max(0, weighted / totalWeight))
    }

    // MARK: - 各指标评分逻辑

    /// Fed 利率趋势：比较最近两个数据点，降息 = 看多
    static func scoreFedRate(current: Double, previous: Double) -> Double {
        let change = current - previous
        if change < -0.25 { return 90 }      // 大幅降息
        if change < 0 { return 75 }           // 小幅降息
        if change == 0 { return 50 }          // 维持不变
        if change < 0.25 { return 30 }        // 小幅升息
        return 15                              // 大幅升息
    }

    /// 10Y-2Y 利差：正斜率看多，反转看空
    static func scoreYieldSpread(spread: Double) -> Double {
        if spread > 1.0 { return 90 }         // 强正斜率
        if spread > 0.5 { return 80 }
        if spread > 0 { return 65 }           // 正常正斜率
        if spread > -0.2 { return 40 }        // 轻微反转
        if spread > -0.5 { return 25 }        // 中度反转
        return 10                              // 深度反转
    }

    /// 10Y 国债殖利率：适中最佳
    static func score10YYield(yield10Y: Double) -> Double {
        if yield10Y < 2.5 { return 85 }       // 低利率环境利好股市
        if yield10Y < 3.5 { return 75 }
        if yield10Y < 4.0 { return 60 }
        if yield10Y < 4.5 { return 45 }
        if yield10Y < 5.0 { return 30 }
        return 15                              // 高利率压制股市
    }

    /// CPI 年增率：温和通胀最佳
    static func scoreCPI(yoy: Double) -> Double {
        if yoy < 0 { return 25 }              // 通缩 — 经济衰退信号
        if yoy < 1.5 { return 60 }            // 偏低
        if yoy < 2.5 { return 90 }            // 理想区间
        if yoy < 3.5 { return 70 }            // 略高但可控
        if yoy < 5.0 { return 40 }            // 偏高
        return 15                              // 高通胀
    }

    /// 失业率评分
    static func scoreUnemployment(rate: Double) -> Double {
        if rate < 3.5 { return 90 }           // 极低失业
        if rate < 4.0 { return 80 }
        if rate < 4.5 { return 65 }
        if rate < 5.5 { return 50 }
        if rate < 7.0 { return 30 }
        return 15                              // 高失业
    }

    /// ISM PMI 评分
    static func scorePMI(pmi: Double) -> Double {
        if pmi > 55 { return 90 }             // 强劲扩张
        if pmi > 52 { return 80 }
        if pmi > 50 { return 65 }             // 温和扩张
        if pmi > 48 { return 40 }             // 轻微收缩
        if pmi > 45 { return 25 }
        return 10                              // 严重收缩
    }

    /// GDP 增长率评分
    static func scoreGDP(growth: Double) -> Double {
        if growth > 3.0 { return 90 }
        if growth > 2.0 { return 80 }
        if growth > 1.0 { return 65 }
        if growth > 0 { return 45 }
        if growth > -1.0 { return 25 }
        return 10                              // 衰退
    }

    /// VIX 评分：低波动看多，但极低可能过度自满
    static func scoreVIX(vix: Double) -> Double {
        if vix < 12 { return 60 }             // 过度自满
        if vix < 15 { return 85 }             // 低波动理想
        if vix < 18 { return 75 }
        if vix < 22 { return 55 }             // 正常
        if vix < 28 { return 35 }             // 偏高波动
        if vix < 35 { return 20 }             // 恐慌
        return 10                              // 极度恐慌
    }

    /// CNN Fear & Greed 评分：逆向思维！
    /// 极度恐惧 = 买入机会，极度贪婪 = 风险
    static func scoreFearGreed(index: Double) -> Double {
        // 逆向：恐惧时买入，贪婪时谨慎
        if index < 15 { return 90 }           // 极度恐惧 → 强买入
        if index < 25 { return 80 }           // 恐惧 → 买入
        if index < 40 { return 70 }
        if index < 60 { return 50 }           // 中性
        if index < 75 { return 35 }
        if index < 85 { return 20 }           // 贪婪 → 谨慎
        return 10                              // 极度贪婪 → 高风险
    }

    /// S&P 500 vs 200日均线
    static func scoreSP500Trend(currentPrice: Double, ma200: Double) -> Double {
        let ratio = currentPrice / ma200
        if ratio > 1.10 { return 70 }         // 远高于均线（可能过热）
        if ratio > 1.05 { return 85 }         // 健康上升
        if ratio > 1.0 { return 75 }          // 略高于均线
        if ratio > 0.95 { return 40 }         // 略低于均线
        if ratio > 0.90 { return 25 }         // 显著低于均线
        return 15                              // 深度低于均线
    }
}
