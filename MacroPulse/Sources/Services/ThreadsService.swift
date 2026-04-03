import Foundation

// MARK: - Threads API 服务 (Meta Graph API)

actor ThreadsService {
    private let baseURL = "https://graph.threads.net/v1.0"

    // MARK: - 查找用户 (需要该用户的 Threads User ID)

    func lookupUser(userId: String, accessToken: String) async throws -> ThreadsUser {
        var components = URLComponents(string: "\(baseURL)/\(userId)")!
        components.queryItems = [
            URLQueryItem(name: "fields", value: "id,username,name,threads_biography,threads_profile_picture_url"),
            URLQueryItem(name: "access_token", value: accessToken)
        ]

        guard let url = components.url else { throw APIError.invalidURL }

        let (data, response) = try await URLSession.shared.data(from: url)
        try checkResponse(response)

        return try JSONDecoder().decode(ThreadsUser.self, from: data)
    }

    // MARK: - 获取用户帖文

    func fetchUserThreads(userId: String, accessToken: String, limit: Int = 10) async throws -> [SocialPost] {
        var components = URLComponents(string: "\(baseURL)/\(userId)/threads")!
        components.queryItems = [
            URLQueryItem(name: "fields", value: "id,text,timestamp,like_count,reply_count,repost_count,username"),
            URLQueryItem(name: "limit", value: String(min(limit, 25))),
            URLQueryItem(name: "access_token", value: accessToken)
        ]

        guard let url = components.url else { throw APIError.invalidURL }

        let (data, response) = try await URLSession.shared.data(from: url)
        try checkResponse(response)

        let decoded = try JSONDecoder().decode(ThreadsPostsResponse.self, from: data)
        guard let posts = decoded.data else { return [] }

        let isoFormatter = ISO8601DateFormatter()

        return posts.compactMap { post in
            guard let text = post.text else { return nil }
            let date = isoFormatter.date(from: post.timestamp ?? "") ?? Date()
            return SocialPost(
                id: post.id,
                platform: .threads,
                authorUsername: post.username ?? "",
                authorDisplayName: nil,
                content: text,
                createdAt: date,
                likeCount: post.likeCount,
                replyCount: post.replyCount,
                repostCount: post.repostCount,
                url: nil
            )
        }
    }

    // MARK: - 搜索用户 (Threads API 不支持搜索，需手动输入 User ID)
    // 用户可以通过 https://www.threads.net/@username 找到帐号
    // User ID 需要通过 access token 对应的用户自己的 ID (me endpoint)

    func fetchMyProfile(accessToken: String) async throws -> ThreadsUser {
        var components = URLComponents(string: "\(baseURL)/me")!
        components.queryItems = [
            URLQueryItem(name: "fields", value: "id,username,name,threads_biography"),
            URLQueryItem(name: "access_token", value: accessToken)
        ]

        guard let url = components.url else { throw APIError.invalidURL }

        let (data, response) = try await URLSession.shared.data(from: url)
        try checkResponse(response)

        return try JSONDecoder().decode(ThreadsUser.self, from: data)
    }

    private func checkResponse(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 || http.statusCode == 403 { throw SocialAPIError.unauthorized }
        if http.statusCode == 429 { throw SocialAPIError.rateLimited }
        guard (200...299).contains(http.statusCode) else { throw APIError.badResponse }
    }
}

// MARK: - Threads API 响应模型

struct ThreadsUser: Codable {
    let id: String
    let username: String?
    let name: String?
    let threadsBiography: String?
    let threadsProfilePictureUrl: String?

    enum CodingKeys: String, CodingKey {
        case id, username, name
        case threadsBiography = "threads_biography"
        case threadsProfilePictureUrl = "threads_profile_picture_url"
    }
}

struct ThreadsPostsResponse: Codable {
    let data: [ThreadsPost]?
}

struct ThreadsPost: Codable {
    let id: String
    let text: String?
    let timestamp: String?
    let username: String?
    let likeCount: Int?
    let replyCount: Int?
    let repostCount: Int?

    enum CodingKeys: String, CodingKey {
        case id, text, timestamp, username
        case likeCount = "like_count"
        case replyCount = "reply_count"
        case repostCount = "repost_count"
    }
}
