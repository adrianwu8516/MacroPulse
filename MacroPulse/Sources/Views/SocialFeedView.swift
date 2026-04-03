import SwiftUI

struct SocialFeedView: View {
    @EnvironmentObject var socialFeedManager: SocialFeedManager
    @State private var showAddAccount = false
    @State private var showAPIGuide = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // 标题栏
                HStack {
                    Image(systemName: "person.2.wave.2")
                        .font(.title)
                        .foregroundColor(.accentColor)
                    VStack(alignment: .leading) {
                        Text("社交动态追踪")
                            .font(.title.bold())
                        Text("追踪 X (Twitter) 和 Threads 上的财经帐号")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()

                    Button(action: { showAPIGuide = true }) {
                        Label("API 申请指南", systemImage: "questionmark.circle")
                    }

                    Button(action: { showAddAccount = true }) {
                        Label("添加帐号", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)

                    Button(action: { Task { await socialFeedManager.refreshAll() } }) {
                        if socialFeedManager.isLoading {
                            ProgressView().controlSize(.small)
                        } else {
                            Label("刷新", systemImage: "arrow.clockwise")
                        }
                    }
                    .disabled(socialFeedManager.isLoading)
                }
                .padding(.horizontal)

                // API 状态提示
                apiStatusBanner

                // 错误提示
                if let error = socialFeedManager.errorMessage {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal)
                }

                // 追踪帐号列表
                if !socialFeedManager.accounts.isEmpty {
                    trackedAccountsSection
                }

                // 动态时间轴
                if socialFeedManager.posts.isEmpty && !socialFeedManager.isLoading {
                    emptyState
                } else {
                    postsTimeline
                }
            }
            .padding(.vertical, 20)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .sheet(isPresented: $showAddAccount) {
            AddAccountSheet(socialFeedManager: socialFeedManager)
        }
        .sheet(isPresented: $showAPIGuide) {
            APIGuideSheet()
        }
    }

    // MARK: - API 状态

    @ViewBuilder
    var apiStatusBanner: some View {
        if !socialFeedManager.hasXToken && !socialFeedManager.hasThreadsToken {
            HStack(spacing: 12) {
                Image(systemName: "key.fill")
                    .foregroundColor(.orange)
                VStack(alignment: .leading, spacing: 2) {
                    Text("尚未设置任何 API Token")
                        .font(.subheadline.bold())
                    Text("请先点击「API 申请指南」了解如何获取，然后在「设置」中输入 Token")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Button("查看指南") { showAPIGuide = true }
                    .buttonStyle(.bordered)
            }
            .padding()
            .background(Color.orange.opacity(0.1))
            .cornerRadius(10)
            .padding(.horizontal)
        }
    }

    // MARK: - 追踪帐号

    @ViewBuilder
    var trackedAccountsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("追踪帐号")
                .font(.headline)
                .padding(.horizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(socialFeedManager.accounts) { account in
                        AccountChip(account: account) {
                            socialFeedManager.removeAccount(account)
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    // MARK: - 帖文时间轴

    @ViewBuilder
    var postsTimeline: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("最新动态")
                .font(.headline)
                .padding(.horizontal)

            ForEach(socialFeedManager.posts) { post in
                PostCardView(post: post)
                    .padding(.horizontal)
            }
        }
    }

    // MARK: - 空状态

    @ViewBuilder
    var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "text.bubble")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text("暂无动态")
                .font(.title2)
                .foregroundColor(.secondary)
            Text("添加要追踪的帐号，然后点击刷新获取最新动态")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
        }
        .padding(.top, 60)
    }
}

// MARK: - 帐号标签

struct AccountChip: View {
    let account: SocialAccount
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: account.platform.icon)
                .font(.caption)
            Text("@\(account.username)")
                .font(.subheadline)
            if let name = account.displayName {
                Text(name)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - 帖文卡片

struct PostCardView: View {
    let post: SocialPost

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // 头部：平台、作者、时间
            HStack {
                Image(systemName: post.platform.icon)
                    .foregroundColor(post.platform == .x ? .primary : .purple)
                Text("@\(post.authorUsername)")
                    .font(.subheadline.bold())
                if let name = post.authorDisplayName {
                    Text(name)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Text(post.createdAt.formatted(.relative(presentation: .named)))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            // 内容
            Text(post.content)
                .font(.body)
                .lineLimit(8)

            // 互动数据
            HStack(spacing: 16) {
                if let likes = post.likeCount {
                    Label("\(likes)", systemImage: "heart")
                }
                if let replies = post.replyCount {
                    Label("\(replies)", systemImage: "bubble.left")
                }
                if let reposts = post.repostCount {
                    Label("\(reposts)", systemImage: "arrow.2.squarepath")
                }
                Spacer()
                if let url = post.url, let link = URL(string: url) {
                    Link(destination: link) {
                        Label("查看原文", systemImage: "arrow.up.right.square")
                    }
                }
            }
            .font(.caption)
            .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(nsColor: .controlBackgroundColor))
        .cornerRadius(10)
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }
}

// MARK: - 添加帐号弹窗

struct AddAccountSheet: View {
    @ObservedObject var socialFeedManager: SocialFeedManager
    @Environment(\.dismiss) var dismiss
    @State private var platform: SocialPlatform = .x
    @State private var username = ""

    var body: some View {
        VStack(spacing: 20) {
            Text("添加追踪帐号")
                .font(.title2.bold())

            Picker("平台", selection: $platform) {
                ForEach(SocialPlatform.allCases) { p in
                    Label(p.rawValue, systemImage: p.icon).tag(p)
                }
            }
            .pickerStyle(.segmented)

            TextField("用户名（不含 @）", text: $username)
                .textFieldStyle(.roundedBorder)

            if platform == .threads {
                Text("注意：Threads API 目前仅支持读取自己的帖文。要追踪他人，需等待 Meta 开放公开读取权限。")
                    .font(.caption)
                    .foregroundColor(.orange)
            }

            HStack {
                Button("取消") { dismiss() }
                    .keyboardShortcut(.cancelAction)

                Button("添加") {
                    socialFeedManager.addAccount(platform: platform, username: username)
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(username.trimmingCharacters(in: .whitespaces).isEmpty)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(30)
        .frame(width: 400)
    }
}

// MARK: - API 申请指南弹窗

struct APIGuideSheet: View {
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    Text("API 申请指南")
                        .font(.title.bold())
                    Spacer()
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(.plain)
                }

                // X (Twitter) API
                GroupBox {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("X (Twitter) API", systemImage: "bubble.left.and.text.bubble.right")
                            .font(.title3.bold())

                        Text("X API v2 允许你读取用户的公开推文。")
                            .font(.subheadline)

                        Divider()

                        Text("申请步骤：")
                            .font(.subheadline.bold())

                        guideStep("1", "前往 developer.x.com 并登入你的 X 帐号")
                        guideStep("2", "点击「Sign up for Free Account」注册开发者帐号")
                        guideStep("3", "创建一个 Project 和 App（免费版限 1 个 App）")
                        guideStep("4", "进入 App 设置 → Keys and Tokens")
                        guideStep("5", "生成 Bearer Token（用于只读访问）")
                        guideStep("6", "将 Bearer Token 复制到 MacroPulse「设置」页面")

                        Divider()

                        VStack(alignment: .leading, spacing: 6) {
                            Text("方案与费用：")
                                .font(.subheadline.bold())
                            feeRow("Free", "仅限发推 + 删推，不支持读取他人推文")
                            feeRow("Basic ($200/月)", "10,000 次推文读取/月，支持用户查询")
                            feeRow("Pro ($5,000/月)", "完整 API 访问，100 万次读取/月")
                        }

                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                            Text("注意：Free 方案无法读取推文。如需读取功能，至少需要 Basic 方案 ($200/月)。")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                        .padding(.top, 4)

                        Text("替代方案：如果不想付费，可以考虑使用第三方服务如 SocialData.tools 或 RapidAPI 上的 Twitter 替代 API，价格更低。")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                // Threads API
                GroupBox {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Threads API", systemImage: "at")
                            .font(.title3.bold())

                        Text("Threads API 基于 Meta 的 Graph API，允许读取和发布帖文。")
                            .font(.subheadline)

                        Divider()

                        Text("申请步骤：")
                            .font(.subheadline.bold())

                        guideStep("1", "前往 developers.facebook.com 并登入 Meta 帐号")
                        guideStep("2", "点击「My Apps」→「Create App」")
                        guideStep("3", "选择 App Type，输入 App 名称")
                        guideStep("4", "在 App Dashboard 中，添加「Threads API」产品")
                        guideStep("5", "进入 Threads API → Settings，配置回调 URL（本地测试用 https://localhost/）")
                        guideStep("6", "使用 Threads API 的授权流程获取 Access Token：")
                        guideStep("  6a", "在浏览器打开授权 URL：\nhttps://threads.net/oauth/authorize?client_id=YOUR_APP_ID&redirect_uri=YOUR_REDIRECT&scope=threads_basic,threads_content_publish&response_type=code")
                        guideStep("  6b", "授权后会重定向并附带 code 参数")
                        guideStep("  6c", "用 code 换取短期 Access Token（POST 请求）")
                        guideStep("  6d", "再换取长期 Token（有效期 60 天）")
                        guideStep("7", "将 Access Token 复制到 MacroPulse「设置」页面")

                        Divider()

                        VStack(alignment: .leading, spacing: 6) {
                            Text("费用与限制：")
                                .font(.subheadline.bold())
                            feeRow("免费", "Threads API 完全免费")
                            feeRow("限制", "目前仅能读取自己的帖文，无法读取他人的帖文")
                            feeRow("Token 有效期", "长期 Token 60 天，需定期刷新")
                        }

                        HStack {
                            Image(systemName: "info.circle.fill")
                                .foregroundColor(.blue)
                            Text("Threads API 仍在发展中，Meta 可能会在未来开放公开帖文读取功能。")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(.top, 4)
                    }
                    .padding(.vertical, 4)
                }

                // 通用建议
                GroupBox {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("推荐的财经帐号", systemImage: "star")
                            .font(.subheadline.bold())

                        Text("以下是一些值得追踪的财经/宏观分析帐号（X 平台）：")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        VStack(alignment: .leading, spacing: 4) {
                            accountSuggestion("@zaborsky", "macro analysis")
                            accountSuggestion("@FedGuy12", "Fed & money markets")
                            accountSuggestion("@LynAldenContact", "macro investing")
                            accountSuggestion("@jimbianco", "macro research")
                            accountSuggestion("@SoberLook", "global macro & rates")
                            accountSuggestion("@MacroAlf", "macro & markets")
                        }
                    }
                    .padding(.vertical, 4)
                }

                Button("关闭") { dismiss() }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
            }
            .padding(30)
        }
        .frame(width: 600, height: 700)
    }

    func guideStep(_ num: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(num)
                .font(.caption.bold().monospacedDigit())
                .frame(minWidth: 24, alignment: .trailing)
                .foregroundColor(.accentColor)
            Text(text)
                .font(.subheadline)
        }
    }

    func feeRow(_ plan: String, _ desc: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(plan)
                .font(.caption.bold())
                .frame(width: 120, alignment: .leading)
            Text(desc)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    func accountSuggestion(_ handle: String, _ desc: String) -> some View {
        HStack(spacing: 8) {
            Text(handle)
                .font(.caption.bold())
                .frame(width: 140, alignment: .leading)
            Text(desc)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}
