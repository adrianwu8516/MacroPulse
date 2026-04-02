import Foundation

// MARK: - CNN Fear & Greed 响应模型

struct FearGreedResponse: Codable {
    let fearAndGreed: FearGreedData

    enum CodingKeys: String, CodingKey {
        case fearAndGreed = "fear_and_greed"
    }
}

struct FearGreedData: Codable {
    let score: Double
    let rating: String
    let previousClose: Double
    let previousOneWeek: Double
    let previousOneMonth: Double
    let previousOneYear: Double

    enum CodingKeys: String, CodingKey {
        case score
        case rating
        case previousClose = "previous_close"
        case previousOneWeek = "previous_1_week"
        case previousOneMonth = "previous_1_month"
        case previousOneYear = "previous_1_year"
    }
}

// MARK: - Fear & Greed 服务

actor FearGreedService {
    private let endpoint = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"

    func fetchCurrent() async throws -> FearGreedData {
        guard let url = URL(string: endpoint) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue("Mozilla/5.0", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.badResponse
        }

        let decoded = try JSONDecoder().decode(FearGreedResponse.self, from: data)
        return decoded.fearAndGreed
    }
}
