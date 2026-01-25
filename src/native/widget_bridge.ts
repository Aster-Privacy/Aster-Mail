import { Preferences } from "@capacitor/preferences";

import { is_native_platform, get_platform } from "./capacitor_bridge";

export interface WidgetEmailPreview {
  id: string;
  sender_name: string;
  sender_avatar_initials: string;
  subject: string;
  snippet: string;
  timestamp: number;
  is_unread: boolean;
}

export interface WidgetData {
  unread_count: number;
  draft_count: number;
  emails: WidgetEmailPreview[];
  last_updated: number;
}

const WIDGET_DATA_KEY = "aster_widget_data";

export async function update_widget_data(data: WidgetData): Promise<void> {
  if (!is_native_platform()) return;

  await Preferences.set({
    key: WIDGET_DATA_KEY,
    value: JSON.stringify(data),
  });

  if (get_platform() === "android") {
    await notify_android_widget();
  } else if (get_platform() === "ios") {
    await notify_ios_widget();
  }
}

export async function get_widget_data(): Promise<WidgetData | null> {
  const { value } = await Preferences.get({ key: WIDGET_DATA_KEY });

  return value ? JSON.parse(value) : null;
}

async function notify_android_widget(): Promise<void> {
  try {
    // @ts-expect-error - Android native bridge
    if (window.AndroidWidget?.refresh) {
      // @ts-expect-error - Android native bridge
      window.AndroidWidget.refresh();
    }
  } catch {
    // Widget bridge may not be available
  }
}

async function notify_ios_widget(): Promise<void> {
  try {
    // @ts-expect-error - iOS native bridge
    if (window.webkit?.messageHandlers?.widgetRefresh) {
      // @ts-expect-error - iOS native bridge
      window.webkit.messageHandlers.widgetRefresh.postMessage({});
    }
  } catch {
    // Widget bridge may not be available
  }
}

export function create_email_preview(email: {
  id: string;
  from_name?: string;
  from_email?: string;
  subject?: string;
  snippet?: string;
  received_at?: string | number;
  is_read?: boolean;
}): WidgetEmailPreview {
  const sender_name = email.from_name || email.from_email || "Unknown";
  const initials = get_initials(sender_name);

  return {
    id: email.id,
    sender_name,
    sender_avatar_initials: initials,
    subject: email.subject || "(No subject)",
    snippet: email.snippet || "",
    timestamp:
      typeof email.received_at === "string"
        ? new Date(email.received_at).getTime()
        : email.received_at || Date.now(),
    is_unread: !email.is_read,
  };
}

function get_initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return "??";
  }

  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }

  const first_char = words[0][0] ?? "";
  const last_char = words[words.length - 1][0] ?? "";

  return (first_char + last_char).toUpperCase() || "??";
}

export async function sync_widget_with_inbox(
  emails: Array<{
    id: string;
    from_name?: string;
    from_email?: string;
    subject?: string;
    snippet?: string;
    received_at?: string | number;
    is_read?: boolean;
  }>,
  unread_count: number,
  draft_count: number,
): Promise<void> {
  const widget_emails = emails.slice(0, 5).map(create_email_preview);

  await update_widget_data({
    unread_count,
    draft_count,
    emails: widget_emails,
    last_updated: Date.now(),
  });
}

export function format_widget_timestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  const date = new Date(timestamp);

  return `${date.getMonth() + 1}/${date.getDate()}`;
}
