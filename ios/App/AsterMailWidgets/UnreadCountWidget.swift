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

struct UnreadCountWidgetView: View {
    let entry: MailStatsEntry

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "envelope.fill")
                .font(.system(size: 16))
                .foregroundStyle(.indigo)
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer()

            Text("\(entry.data.unread_count)")
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundStyle(.primary)

            Text("Unread")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
        .padding()
        .widgetURL(URL(string: "astermail://inbox"))
    }
}

struct UnreadCountWidget: Widget {
    let kind = "UnreadCountWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MailStatsTimelineProvider()) { entry in
            UnreadCountWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Unread Count")
        .description("Shows your unread email count.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}
