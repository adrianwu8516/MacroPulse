import Foundation

// MARK: - Alpha Vantage 响应模型

struct AVDailyResponse: Codable {
    let timeSeries: [String: AVDailyData]?

    enum CodingKeys: String, CodingKey {
        case timeSeries = "Time Series (Daily)"
    }
}

struct AVDailyData: Codable {
    let close: String

    enum CodingKeys: String, CodingKey {
        case close = "4. close"
    }
}

struct AVSMAResponse: Codable {
    let technicalAnalysis: [String: AVSMAData]?

    enum CodingKeys: String, CodingKey {
        case technicalAnalysis = "Technical Analysis: SMA"
    }
}

struct AVSMAData: Codable {
    let sma: String

    enum CodingKeys: String, CodingKey {
        case sma = "SMA"
    }
}

// MARK: - 市场数据服务

actor MarketDataService {
    private let baseURL = "https://www.alphavantage.co/query"

    /// 获取 S&P 500 (SPY) 最新价格
    func fetchSPYPrice(apiKey: String) async throws -> Double {
        var components = URLComponents(string: baseURL)!
        components.queryItems = [
            URLQueryItem(name: "function", value: "GLOBAL_QUOTE"),
            URLQueryItem(name: "symbol", value: "SPY"),
            URLQueryItem(name: "apikey", value: apiKey)
        ]

        guard let url = components.url else { throw APIError.invalidURL }
        let (data, response) = try await URLSession.shared.data(from: url)

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.badResponse
        }

        // Alpha Vantage GLOBAL_QUOTE 格式
        struct QuoteResponse: Codable {
            let globalQuote: QuoteData?
            enum CodingKeys: String, CodingKey {
                case globalQuote = "Global Quote"
            }
        }
        struct QuoteData: Codable {
            let price: String
            enum CodingKeys: String, CodingKey {
                case price = "05. price"
            }
        }

        let decoded = try JSONDecoder().decode(QuoteResponse.self, from: data)
        guard let priceStr = decoded.globalQuote?.price, let price = Double(priceStr) else {
            throw APIError.noData
        }
        return price
    }

    /// 获取 200 日均线
    func fetchSMA200(apiKey: String) async throws -> Double {
        var components = URLComponents(string: baseURL)!
        components.queryItems = [
            URLQueryItem(name: "function", value: "SMA"),
            URLQueryItem(name: "symbol", value: "SPY"),
            URLQueryItem(name: "interval", value: "daily"),
            URLQueryItem(name: "time_period", value: "200"),
            URLQueryItem(name: "series_type", value: "close"),
            URLQueryItem(name: "apikey", value: apiKey)
        ]

        guard let url = components.url else { throw APIError.invalidURL }
        let (data, response) = try await URLSession.shared.data(from: url)

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.badResponse
        }

        let decoded = try JSONDecoder().decode(AVSMAResponse.self, from: data)
        guard let analysis = decoded.technicalAnalysis,
              let latest = analysis.sorted(by: { $0.key > $1.key }).first,
              let sma = Double(latest.value.sma) else {
            throw APIError.noData
        }
        return sma
    }
}
