//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import WidgetKit

struct MailWidgetData {
    let unread_count: Int
    let starred_count: Int
    let drafts_count: Int
    let last_updated: Date
}

struct WidgetDataProvider {
    static let suite_name = "group.com.astermail.app"

    static func load() -> MailWidgetData {
        guard let defaults = UserDefaults(suiteName: suite_name) else {
            return MailWidgetData(unread_count: 0, starred_count: 0, drafts_count: 0, last_updated: Date())
        }

        let unread = Int(defaults.string(forKey: "unread_count") ?? "0") ?? 0
        let starred = Int(defaults.string(forKey: "starred_count") ?? "0") ?? 0
        let drafts = Int(defaults.string(forKey: "drafts_count") ?? "0") ?? 0
        let ts = Double(defaults.string(forKey: "last_updated") ?? "0") ?? 0
        let last_updated = ts > 0 ? Date(timeIntervalSince1970: ts / 1000) : Date()

        return MailWidgetData(
            unread_count: unread,
            starred_count: starred,
            drafts_count: drafts,
            last_updated: last_updated
        )
    }
}

struct MailStatsEntry: TimelineEntry {
    let date: Date
    let data: MailWidgetData
}

struct MailStatsTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> MailStatsEntry {
        MailStatsEntry(
            date: Date(),
            data: MailWidgetData(unread_count: 3, starred_count: 5, drafts_count: 2, last_updated: Date())
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (MailStatsEntry) -> Void) {
        let data = WidgetDataProvider.load()
        completion(MailStatsEntry(date: Date(), data: data))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MailStatsEntry>) -> Void) {
        let data = WidgetDataProvider.load()
        let entry = MailStatsEntry(date: Date(), data: data)
        let next_update = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(next_update))
        completion(timeline)
    }
}
