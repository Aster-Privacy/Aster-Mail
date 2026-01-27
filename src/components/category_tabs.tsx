import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  InboxIcon,
  UserGroupIcon,
  TagIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
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
  color: string;
}

const CATEGORY_CONFIGS: CategoryTabConfig[] = [
  {
    id: "all",
    label: "All",
    icon: InboxIcon,
    color: "text-[var(--text-secondary)]",
  },
  {
    id: "primary",
    label: "Primary",
    icon: InboxIcon,
    color: "text-slate-600 dark:text-slate-400",
  },
  {
    id: "social",
    label: "Social",
    icon: UserGroupIcon,
    color: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "promotions",
    label: "Promotions",
    icon: TagIcon,
    color: "text-green-600 dark:text-green-400",
  },
  {
    id: "updates",
    label: "Updates",
    icon: BellIcon,
    color: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "forums",
    label: "Forums",
    icon: ChatBubbleLeftRightIcon,
    color: "text-purple-600 dark:text-purple-400",
  },
];

const ACTIVE_COLORS: Record<EmailCategory | "all", string> = {
  all: "border-[var(--accent-color)]",
  primary: "border-slate-500",
  social: "border-blue-500",
  promotions: "border-green-500",
  updates: "border-amber-500",
  forums: "border-purple-500",
};

function CategoryTabs({
  active_category,
  on_category_change,
  unread_counts,
  show_all_tab = true,
  className,
}: CategoryTabsProps) {
  const scroll_ref = useRef<HTMLDivElement>(null);

  const visible_categories = show_all_tab
    ? CATEGORY_CONFIGS
    : CATEGORY_CONFIGS.filter((c) => c.id !== "all");

  const get_unread_count = (category: EmailCategory | "all"): number => {
    if (category === "all") {
      return Object.values(unread_counts).reduce((sum, count) => sum + count, 0);
    }
    return unread_counts[category] ?? 0;
  };

  useEffect(() => {
    if (scroll_ref.current) {
      const active_tab = scroll_ref.current.querySelector(
        `[data-category="${active_category}"]`,
      );
      if (active_tab) {
        active_tab.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [active_category]);

  return (
    <div
      className={cn(
        "relative flex items-center border-b border-[var(--border-primary)]",
        "bg-[var(--bg-primary)]",
        className,
      )}
    >
      <div
        ref={scroll_ref}
        className="flex items-center gap-0.5 overflow-x-auto scrollbar-none px-2"
      >
        {visible_categories.map((config) => {
          const is_active = active_category === config.id;
          const unread = get_unread_count(config.id);
          const IconComponent = config.icon;

          return (
            <button
              key={config.id}
              data-category={config.id}
              onClick={() => on_category_change(config.id)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium",
                "transition-colors duration-150 whitespace-nowrap",
                "border-b-2 -mb-px",
                is_active
                  ? cn(
                      "text-[var(--text-primary)]",
                      ACTIVE_COLORS[config.id],
                    )
                  : cn(
                      "text-[var(--text-secondary)] border-transparent",
                      "hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/50",
                    ),
              )}
            >
              <IconComponent
                className={cn(
                  "w-4 h-4 flex-shrink-0",
                  is_active ? config.color : "text-[var(--text-tertiary)]",
                )}
              />
              <span>{config.label}</span>
              <AnimatePresence mode="wait">
                {unread > 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      "inline-flex items-center justify-center",
                      "min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full",
                      is_active
                        ? "bg-[var(--accent-color)] text-white"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
                    )}
                  >
                    {unread > 99 ? "99+" : unread}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { CategoryTabs, CATEGORY_CONFIGS, ACTIVE_COLORS };
export type { CategoryTabsProps, CategoryTabConfig };
