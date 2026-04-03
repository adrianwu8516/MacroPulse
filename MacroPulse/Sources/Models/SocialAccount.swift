import Foundation

// MARK: - 社交媒体平台

enum SocialPlatform: String, Codable, CaseIterable, Identifiable {
    case x = "X (Twitter)"
    case threads = "Threads"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .x: return "bubble.left.and.text.bubble.right"
        case .threads: return "at"
        }
    }
}

// MARK: - 追踪帐号

struct SocialAccount: Codable, Identifiable {
    let id: UUID
    let platform: SocialPlatform
    let username: String        // 不含 @
    var displayName: String?
    var bio: String?
    var addedAt: Date

    init(platform: SocialPlatform, username: String, displayName: String? = nil, bio: String? = nil) {
        self.id = UUID()
        self.platform = platform
        self.username = username.trimmingCharacters(in: CharacterSet(charactersIn: "@"))
        self.displayName = displayName
        self.bio = bio
        self.addedAt = Date()
    }
}

// MARK: - 社交帖文

struct SocialPost: Codable, Identifiable {
    let id: String
    let platform: SocialPlatform
    let authorUsername: String
    let authorDisplayName: String?
    let content: String
    let createdAt: Date
    let likeCount: Int?
    let replyCount: Int?
    let repostCount: Int?
    let url: String?
}
