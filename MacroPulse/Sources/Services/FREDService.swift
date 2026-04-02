import Foundation

// MARK: - FRED API 响应模型

struct FREDResponse: Codable {
    let observations: [FREDObservation]
}

struct FREDObservation: Codable {
    let date: String
    let value: String
}

// MARK: - FRED 服务

actor FREDService {
    private let baseURL = "https://api.stlouisfed.org/fred/series/observations"

    func fetchSeries(seriesID: String, apiKey: String, limit: Int = 30) async throws -> [FREDObservation] {
        var components = URLComponents(string: baseURL)!
        components.queryItems = [
            URLQueryItem(name: "series_id", value: seriesID),
            URLQueryItem(name: "api_key", value: apiKey),
            URLQueryItem(name: "file_type", value: "json"),
            URLQueryItem(name: "sort_order", value: "desc"),
            URLQueryItem(name: "limit", value: String(limit))
        ]

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        let (data, response) = try await URLSession.shared.data(from: url)

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.badResponse
        }

        let decoded = try JSONDecoder().decode(FREDResponse.self, from: data)
        return decoded.observations
    }

    /// 获取最新值（跳过 "." 无效值）
    func fetchLatestValue(seriesID: String, apiKey: String) async throws -> Double {
        let observations = try await fetchSeries(seriesID: seriesID, apiKey: apiKey, limit: 10)
        for obs in observations {
            if let val = Double(obs.value) {
                return val
            }
        }
        throw APIError.noData
    }

    /// 获取最近两个有效值（用于计算趋势）
    func fetchRecentTwo(seriesID: String, apiKey: String) async throws -> (current: Double, previous: Double) {
        let observations = try await fetchSeries(seriesID: seriesID, apiKey: apiKey, limit: 20)
        var values: [Double] = []
        for obs in observations {
            if let val = Double(obs.value) {
                values.append(val)
                if values.count == 2 { break }
            }
        }
        guard values.count >= 2 else { throw APIError.noData }
        return (values[0], values[1])
    }

    /// 获取历史数据点（用于图表）
    func fetchHistory(seriesID: String, apiKey: String, limit: Int = 60) async throws -> [IndicatorSnapshot] {
        let observations = try await fetchSeries(seriesID: seriesID, apiKey: apiKey, limit: limit)
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        return observations.compactMap { obs in
            guard let value = Double(obs.value),
                  let date = formatter.date(from: obs.date) else { return nil }
            return IndicatorSnapshot(date: date, value: value)
        }.reversed()
    }

    /// 获取按日期索引的历史数据（用于补齐历史快照）
    func fetchHistoryMap(seriesID: String, apiKey: String, limit: Int = 90) async throws -> [String: Double] {
        let observations = try await fetchSeries(seriesID: seriesID, apiKey: apiKey, limit: limit)
        var map: [String: Double] = [:]
        for obs in observations {
            if let val = Double(obs.value) {
                map[obs.date] = val
            }
        }
        return map
    }
}

// MARK: - 错误类型

enum APIError: LocalizedError {
    case invalidURL
    case badResponse
    case noData
    case decodingError

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "无效的 URL"
        case .badResponse: return "服务器响应错误"
        case .noData: return "无可用数据"
        case .decodingError: return "数据解析失败"
        }
    }
}
