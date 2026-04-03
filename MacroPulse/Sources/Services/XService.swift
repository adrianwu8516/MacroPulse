import Foundation

// MARK: - X (Twitter) API v2 服务

actor XService {
    private let baseURL = "https://api.x.com/2"

    // MARK: - 查找用户

    func lookupUser(username: String, bearerToken: String) async throws -> XUser {
        var components = URLComponents(string: "\(baseURL)/users/by/username/\(username)")!
        components.queryItems = [
            URLQueryItem(name: "user.fields", value: "name,username,description,profile_image_url,public_metrics")
        ]

        guard let url = components.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        try checkResponse(response)

        let decoded = try JSONDecoder().decode(XUserResponse.self, from: data)
        guard let user = decoded.data else {
            throw APIError.noData
        }
        return user
    }

    // MARK: - 获取用户最近推文

    func fetchUserTweets(userId: String, bearerToken: String, maxResults: Int = 10) async throws -> [SocialPost] {
        var components = URLComponents(string: "\(baseURL)/users/\(userId)/tweets")!
        components.queryItems = [
            URLQueryItem(name: "max_results", value: String(min(maxResults, 100))),
            URLQueryItem(name: "tweet.fields", value: "created_at,public_metrics,text"),
            URLQueryItem(name: "expansions", value: "author_id"),
            URLQueryItem(name: "user.fields", value: "name,username")
        ]

        guard let url = components.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        try checkResponse(response)

        let decoded = try JSONDecoder().decode(XTweetsResponse.self, from: data)
        guard let tweets = decoded.data else { return [] }

        let author = decoded.includes?.users?.first

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallbackFormatter = ISO8601DateFormatter()

        return tweets.compactMap { tweet in
            let date = isoFormatter.date(from: tweet.createdAt ?? "") ?? fallbackFormatter.date(from: tweet.createdAt ?? "") ?? Date()
            return SocialPost(
                id: tweet.id,
                platform: .x,
                authorUsername: author?.username ?? "",
                authorDisplayName: author?.name,
                content: tweet.text,
                createdAt: date,
                likeCount: tweet.publicMetrics?.likeCount,
                replyCount: tweet.publicMetrics?.replyCount,
                repostCount: tweet.publicMetrics?.retweetCount,
                url: "https://x.com/\(author?.username ?? "_")/status/\(tweet.id)"
            )
        }
    }

    private func checkResponse(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 { throw SocialAPIError.unauthorized }
        if http.statusCode == 429 { throw SocialAPIError.rateLimited }
        guard (200...299).contains(http.statusCode) else { throw APIError.badResponse }
    }
}

// MARK: - X API 响应模型

struct XUserResponse: Codable {
    let data: XUser?
}

struct XUser: Codable {
    let id: String
    let name: String
    let username: String
    let description: String?
    let profileImageUrl: String?
    let publicMetrics: XUserMetrics?

    enum CodingKeys: String, CodingKey {
        case id, name, username, description
        case profileImageUrl = "profile_image_url"
        case publicMetrics = "public_metrics"
    }
}

struct XUserMetrics: Codable {
    let followersCount: Int?
    let tweetCount: Int?

    enum CodingKeys: String, CodingKey {
        case followersCount = "followers_count"
        case tweetCount = "tweet_count"
    }
}

struct XTweetsResponse: Codable {
    let data: [XTweet]?
    let includes: XIncludes?
}

struct XIncludes: Codable {
    let users: [XIncludeUser]?
}

struct XIncludeUser: Codable {
    let name: String
    let username: String
}

struct XTweet: Codable {
    let id: String
    let text: String
    let createdAt: String?
    let publicMetrics: XTweetMetrics?

    enum CodingKeys: String, CodingKey {
        case id, text
        case createdAt = "created_at"
        case publicMetrics = "public_metrics"
    }
}

struct XTweetMetrics: Codable {
    let likeCount: Int?
    let replyCount: Int?
    let retweetCount: Int?

    enum CodingKeys: String, CodingKey {
        case likeCount = "like_count"
        case replyCount = "reply_count"
        case retweetCount = "retweet_count"
    }
}

// MARK: - 社交 API 错误

enum SocialAPIError: LocalizedError {
    case unauthorized
    case rateLimited
    case notConfigured

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "API 认证失败，请检查 Token"
        case .rateLimited: return "API 请求频率超限，请稍后再试"
        case .notConfigured: return "尚未设置 API Key"
        }
    }
}
