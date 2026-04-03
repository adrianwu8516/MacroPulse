import SwiftUI

// MARK: - 社交动态管理器

@MainActor
class SocialFeedManager: ObservableObject {
    @Published var accounts: [SocialAccount] = []
    @Published var posts: [SocialPost] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    // API Keys
    @AppStorage("xBearerToken") var xBearerToken = ""
    @AppStorage("threadsAccessToken") var threadsAccessToken = ""

    private let xService = XService()
    private let threadsService = ThreadsService()

    var hasXToken: Bool { !xBearerToken.trimmingCharacters(in: .whitespaces).isEmpty }
    var hasThreadsToken: Bool { !threadsAccessToken.trimmingCharacters(in: .whitespaces).isEmpty }

    // 持久化路径
    private var accountsFileURL: URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("MacroPulse", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("social_accounts.json")
    }

    init() {
        loadAccounts()
    }

    // MARK: - 帐号管理

    func addAccount(platform: SocialPlatform, username: String) {
        guard !username.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let clean = username.trimmingCharacters(in: CharacterSet(charactersIn: "@ "))

        // 避免重复
        if accounts.contains(where: { $0.platform == platform && $0.username.lowercased() == clean.lowercased() }) {
            return
        }

        let account = SocialAccount(platform: platform, username: clean)
        accounts.append(account)
        saveAccounts()
    }

    func removeAccount(_ account: SocialAccount) {
        accounts.removeAll { $0.id == account.id }
        posts.removeAll { $0.authorUsername.lowercased() == account.username.lowercased() && $0.platform == account.platform }
        saveAccounts()
    }

    // MARK: - 刷新动态

    func refreshAll() async {
        isLoading = true
        errorMessage = nil
        var allPosts: [SocialPost] = []
        var errors: [String] = []

        // X 帐号
        if hasXToken {
            for account in accounts.filter({ $0.platform == .x }) {
                do {
                    let user = try await xService.lookupUser(username: account.username, bearerToken: xBearerToken)
                    let tweets = try await xService.fetchUserTweets(userId: user.id, bearerToken: xBearerToken, maxResults: 10)
                    allPosts.append(contentsOf: tweets)

                    // 更新 displayName
                    if let idx = accounts.firstIndex(where: { $0.id == account.id }) {
                        accounts[idx].displayName = user.name
                        accounts[idx].bio = user.description
                    }
                } catch {
                    errors.append("X @\(account.username): \(error.localizedDescription)")
                }
            }
        } else if accounts.contains(where: { $0.platform == .x }) {
            errors.append("请先设置 X Bearer Token")
        }

        // Threads 帐号
        if hasThreadsToken {
            for account in accounts.filter({ $0.platform == .threads }) {
                do {
                    // Threads API 需要 user ID，先尝试用 me endpoint
                    // 注意：Threads API 只能读取自己的帖文，无法读取其他用户
                    let me = try await threadsService.fetchMyProfile(accessToken: threadsAccessToken)
                    let threadPosts = try await threadsService.fetchUserThreads(userId: me.id, accessToken: threadsAccessToken, limit: 10)
                    allPosts.append(contentsOf: threadPosts)

                    if let idx = accounts.firstIndex(where: { $0.id == account.id }) {
                        accounts[idx].displayName = me.name
                        accounts[idx].bio = me.threadsBiography
                    }
                } catch {
                    errors.append("Threads @\(account.username): \(error.localizedDescription)")
                }
            }
        } else if accounts.contains(where: { $0.platform == .threads }) {
            errors.append("请先设置 Threads Access Token")
        }

        posts = allPosts.sorted { $0.createdAt > $1.createdAt }

        if !errors.isEmpty {
            errorMessage = errors.joined(separator: "\n")
        }

        saveAccounts()
        isLoading = false
    }

    // MARK: - 持久化

    private func loadAccounts() {
        guard FileManager.default.fileExists(atPath: accountsFileURL.path) else { return }
        do {
            let data = try Data(contentsOf: accountsFileURL)
            accounts = try JSONDecoder().decode([SocialAccount].self, from: data)
        } catch {
            print("[SocialFeedManager] 读取帐号失败: \(error)")
        }
    }

    private func saveAccounts() {
        do {
            let data = try JSONEncoder().encode(accounts)
            try data.write(to: accountsFileURL, options: .atomic)
        } catch {
            print("[SocialFeedManager] 保存帐号失败: \(error)")
        }
    }
}
