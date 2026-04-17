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

struct QuickComposeWidgetView: View {
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "square.and.pencil")
                .font(.system(size: 32))
                .foregroundStyle(.indigo)

            Text("New Email")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetURL(URL(string: "astermail://compose"))
    }
}

struct QuickComposeWidget: Widget {
    let kind = "QuickComposeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MailStatsTimelineProvider()) { _ in
            QuickComposeWidgetView()
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Quick Compose")
        .description("Quickly compose a new email.")
        .supportedFamilies([.systemSmall])
    }
}
