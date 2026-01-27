import {
  InboxIcon,
  UserGroupIcon,
  TagIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  ShoppingBagIcon,
} from "@heroicons/react/24/outline";

import type { EmailCategory } from "@/types/email";
import { cn } from "@/lib/utils";

interface CategoryTabsProps {
  active_category: EmailCategory | "all";
  on_category_change: (category: EmailCategory | "all") => void;
  unread_counts: Record<EmailCategory, number>;
  show_all_tab?: boolean;
  className?: string;
}

interface CategoryTabConfig {
  id: EmailCategory | "all";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CATEGORY_CONFIGS: CategoryTabConfig[] = [
  { id: "all", label: "All", icon: InboxIcon },
  { id: "primary", label: "Primary", icon: InboxIcon },
  { id: "social", label: "Social", icon: UserGroupIcon },
  { id: "promotions", label: "Promotions", icon: TagIcon },
  { id: "updates", label: "Updates", icon: BellIcon },
  { id: "forums", label: "Forums", icon: ChatBubbleLeftRightIcon },
  { id: "purchases", label: "Purchases", icon: ShoppingBagIcon },
];

function CategoryTabs({
  active_category,
  on_category_change,
  unread_counts,
  show_all_tab = true,
  className,
}: CategoryTabsProps) {
  const visible_categories = show_all_tab
    ? CATEGORY_CONFIGS
    : CATEGORY_CONFIGS.filter((c) => c.id !== "all");

  const get_unread_count = (category: EmailCategory | "all"): number => {
    if (category === "all") {
      return Object.values(unread_counts).reduce((sum, count) => sum + count, 0);
    }
    return unread_counts[category] ?? 0;
  };

  return (
    <div
      className={cn(
        "flex-shrink-0 border-b",
        className,
      )}
      style={{ borderColor: "var(--border-primary)" }}
    >
      <div className="flex items-center gap-0.5 px-3 sm:px-4 py-2">
        {visible_categories.map((config) => {
          const is_active = active_category === config.id;
          const unread = get_unread_count(config.id);
          const IconComponent = config.icon;

          return (
            <button
              key={config.id}
              onClick={() => on_category_change(config.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-[13px] font-medium rounded-md transition-colors duration-150 whitespace-nowrap border",
                is_active
                  ? "text-[var(--text-primary)] bg-[var(--indicator-bg)] border-[var(--border-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border-transparent",
              )}
            >
              <IconComponent className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{config.label}</span>
              {unread > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-semibold rounded-full",
                    is_active
                      ? "bg-[var(--accent-color)] text-white"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
                  )}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { CategoryTabs, CATEGORY_CONFIGS };
export type { CategoryTabsProps, CategoryTabConfig };
