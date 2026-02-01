import type { MailItem } from "./api/mail";
import type { MailItemMetadata } from "@/types/email";

export type MailFolder =
  | "inbox"
  | "sent"
  | "drafts"
  | "scheduled"
  | "starred"
  | "archived"
  | "spam"
  | "trash"
  | "snoozed"
  | "all";

export interface MailFilterOptions {
  folder?: MailFolder;
  is_read?: boolean;
  is_starred?: boolean;
  search_query?: string;
  category_token?: string;
  label_token?: string;
}

export interface FilteredMailResult {
  items: MailItem[];
  total: number;
}

export function filter_mail_items_by_metadata(
  items: MailItem[],
  metadata_map: Map<string, MailItemMetadata>,
  options: MailFilterOptions,
): FilteredMailResult {
  let filtered = items.filter((item) => {
    const metadata = metadata_map.get(item.id) ?? item.metadata;

    if (!metadata) {
      return options.folder === "all";
    }

    return matches_filter(item, metadata, options);
  });

  filtered = sort_by_timestamp(filtered, metadata_map);

  return {
    items: filtered,
    total: filtered.length,
  };
}

function matches_filter(
  item: MailItem,
  metadata: MailItemMetadata,
  options: MailFilterOptions,
): boolean {
  if (options.folder) {
    if (!matches_folder(item, metadata, options.folder)) {
      return false;
    }
  }

  if (options.is_read !== undefined && metadata.is_read !== options.is_read) {
    return false;
  }

  if (
    options.is_starred !== undefined &&
    metadata.is_starred !== options.is_starred
  ) {
    return false;
  }

  if (
    options.category_token &&
    item.category_token !== options.category_token
  ) {
    return false;
  }

  return true;
}

function matches_folder(
  item: MailItem,
  metadata: MailItemMetadata,
  folder: MailFolder,
): boolean {
  switch (folder) {
    case "inbox":
      return (
        item.item_type === "received" &&
        !metadata.is_trashed &&
        !metadata.is_archived &&
        !metadata.is_spam
      );
    case "sent":
      return item.item_type === "sent" && !metadata.is_trashed;
    case "drafts":
      return item.item_type === "draft" && !metadata.is_trashed;
    case "scheduled":
      return item.item_type === "scheduled" && !metadata.is_trashed;
    case "starred":
      return metadata.is_starred && !metadata.is_trashed;
    case "archived":
      return metadata.is_archived && !metadata.is_trashed;
    case "spam":
      return metadata.is_spam && !metadata.is_trashed;
    case "trash":
      return metadata.is_trashed;
    case "snoozed":
      return (
        !!metadata.snoozed_until &&
        new Date(metadata.snoozed_until) > new Date() &&
        !metadata.is_trashed
      );
    case "all":
      return true;
    default:
      return true;
  }
}

function sort_by_timestamp(
  items: MailItem[],
  metadata_map: Map<string, MailItemMetadata>,
): MailItem[] {
  return [...items].sort((a, b) => {
    const meta_a = metadata_map.get(a.id) ?? a.metadata;
    const meta_b = metadata_map.get(b.id) ?? b.metadata;

    const ts_a = meta_a?.message_ts ?? a.message_ts ?? a.created_at;
    const ts_b = meta_b?.message_ts ?? b.message_ts ?? b.created_at;

    return new Date(ts_b).getTime() - new Date(ts_a).getTime();
  });
}

export function get_folder_from_route(path: string): MailFolder {
  if (path.includes("/inbox")) return "inbox";
  if (path.includes("/sent")) return "sent";
  if (path.includes("/drafts")) return "drafts";
  if (path.includes("/scheduled")) return "scheduled";
  if (path.includes("/starred")) return "starred";
  if (path.includes("/archived") || path.includes("/archive"))
    return "archived";
  if (path.includes("/spam")) return "spam";
  if (path.includes("/trash")) return "trash";
  if (path.includes("/snoozed")) return "snoozed";

  return "inbox";
}

export function get_item_type_for_folder(
  folder: MailFolder,
): "received" | "sent" | "draft" | "scheduled" | undefined {
  switch (folder) {
    case "inbox":
      return "received";
    case "sent":
      return "sent";
    case "drafts":
      return "draft";
    case "scheduled":
      return "scheduled";
    default:
      return undefined;
  }
}

export interface ClientSideStats {
  inbox: number;
  sent: number;
  drafts: number;
  scheduled: number;
  starred: number;
  archived: number;
  spam: number;
  trash: number;
  unread: number;
}

export function compute_stats_from_metadata(
  items: MailItem[],
  metadata_map: Map<string, MailItemMetadata>,
): ClientSideStats {
  const stats: ClientSideStats = {
    inbox: 0,
    sent: 0,
    drafts: 0,
    scheduled: 0,
    starred: 0,
    archived: 0,
    spam: 0,
    trash: 0,
    unread: 0,
  };

  for (const item of items) {
    const metadata = metadata_map.get(item.id) ?? item.metadata;

    if (!metadata) continue;

    if (metadata.is_trashed) {
      stats.trash++;
      continue;
    }

    if (item.item_type === "received") {
      if (!metadata.is_archived && !metadata.is_spam) {
        stats.inbox++;
        if (!metadata.is_read) {
          stats.unread++;
        }
      }
    }

    if (item.item_type === "sent") {
      stats.sent++;
    }

    if (item.item_type === "draft") {
      stats.drafts++;
    }

    if (item.item_type === "scheduled") {
      stats.scheduled++;
    }

    if (metadata.is_starred) {
      stats.starred++;
    }

    if (metadata.is_archived) {
      stats.archived++;
    }

    if (metadata.is_spam) {
      stats.spam++;
    }
  }

  return stats;
}
