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
package com.astermail.app.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

import com.astermail.app.R;

public class MailStatsWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widget_ids) {
        for (int widget_id : widget_ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_mail_stats);

            views.setTextViewText(R.id.stats_unread_count, WidgetUpdateHelper.getUnreadCount(context));
            views.setTextViewText(R.id.stats_starred_count, WidgetUpdateHelper.getStarredCount(context));
            views.setTextViewText(R.id.stats_drafts_count, WidgetUpdateHelper.getDraftsCount(context));

            views.setOnClickPendingIntent(R.id.stats_unread_section, WidgetUpdateHelper.createDeepLinkIntent(context, "inbox"));
            views.setOnClickPendingIntent(R.id.stats_starred_section, WidgetUpdateHelper.createDeepLinkIntent(context, "starred"));
            views.setOnClickPendingIntent(R.id.stats_drafts_section, WidgetUpdateHelper.createDeepLinkIntent(context, "drafts"));

            manager.updateAppWidget(widget_id, views);
        }
    }
}
