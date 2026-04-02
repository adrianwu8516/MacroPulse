import Foundation

// MARK: - 历史数据持久化

actor HistoryStore {
    private let fileURL: URL
    private var snapshots: [DailySnapshot] = []
    private let calendar = Calendar.current

    init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("MacroPulse", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.fileURL = dir.appendingPathComponent("history.json")
    }

    // MARK: - 读取

    func load() -> [DailySnapshot] {
        if snapshots.isEmpty {
            snapshots = readFromDisk()
        }
        return snapshots.sorted { $0.date < $1.date }
    }

    // MARK: - 保存当天快照

    func save(snapshot: DailySnapshot) {
        if snapshots.isEmpty {
            snapshots = readFromDisk()
        }

        let day = calendar.startOfDay(for: snapshot.date)

        // 如果当天已有记录，替换
        if let idx = snapshots.firstIndex(where: { calendar.isDate($0.date, inSameDayAs: day) }) {
            snapshots[idx] = snapshot
        } else {
            snapshots.append(snapshot)
        }

        writeToDisk()
    }

    // MARK: - 批量保存（用于补齐历史）

    func saveMultiple(newSnapshots: [DailySnapshot]) {
        if snapshots.isEmpty {
            snapshots = readFromDisk()
        }

        for snap in newSnapshots {
            let day = calendar.startOfDay(for: snap.date)
            if let idx = snapshots.firstIndex(where: { calendar.isDate($0.date, inSameDayAs: day) }) {
                // 已有记录，不覆盖（保留首次抓取的完整数据）
                _ = idx
            } else {
                snapshots.append(snap)
            }
        }

        writeToDisk()
    }

    // MARK: - 查找缺失的日期

    func missingDates(inLast days: Int) -> [Date] {
        if snapshots.isEmpty {
            snapshots = readFromDisk()
        }

        let today = calendar.startOfDay(for: Date())
        let existingDays = Set(snapshots.map { calendar.startOfDay(for: $0.date) })

        var missing: [Date] = []
        for offset in 1...days {
            guard let date = calendar.date(byAdding: .day, value: -offset, to: today) else { continue }
            let day = calendar.startOfDay(for: date)
            // 只补工作日（周一~周五），因为多数金融指标只有交易日数据
            let weekday = calendar.component(.weekday, from: day)
            if weekday == 1 || weekday == 7 { continue }
            if !existingDays.contains(day) {
                missing.append(day)
            }
        }
        return missing.sorted()
    }

    // MARK: - 磁盘读写

    private func readFromDisk() -> [DailySnapshot] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        do {
            let data = try Data(contentsOf: fileURL)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode([DailySnapshot].self, from: data)
        } catch {
            print("[HistoryStore] 读取失败: \(error)")
            return []
        }
    }

    private func writeToDisk() {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(snapshots)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("[HistoryStore] 写入失败: \(error)")
        }
    }
}
