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
import SwiftUI
import WidgetKit

struct MailStatsWidgetView: View {
    let entry: MailStatsEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Aster Mail")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.primary)

            Spacer()

            HStack(spacing: 0) {
                stat_column(count: entry.data.unread_count, label: "Unread", link: "astermail://inbox")

                Divider()
                    .padding(.vertical, 4)

                stat_column(count: entry.data.starred_count, label: "Starred", link: "astermail://starred")

                Divider()
                    .padding(.vertical, 4)

                stat_column(count: entry.data.drafts_count, label: "Drafts", link: "astermail://drafts")
            }
        }
        .padding()
    }

    private func stat_column(count: Int, label: String, link: String) -> some View {
        Link(destination: URL(string: link)!) {
            VStack(spacing: 2) {
                Text("\(count)")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)

                Text(label)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

struct MailStatsWidget: Widget {
    let kind = "MailStatsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MailStatsTimelineProvider()) { entry in
            MailStatsWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Mail Stats")
        .description("Shows unread, starred, and draft counts.")
        .supportedFamilies([.systemMedium])
    }
}
