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

public class UnreadCountWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widget_ids) {
        for (int widget_id : widget_ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_unread_count);

            String count = WidgetUpdateHelper.getUnreadCount(context);
            views.setTextViewText(R.id.unread_count_text, count);
            views.setOnClickPendingIntent(R.id.widget_root, WidgetUpdateHelper.createDeepLinkIntent(context, "inbox"));

            manager.updateAppWidget(widget_id, views);
        }
    }
}
