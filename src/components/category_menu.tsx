import type { EmailCategory } from "@/types/email";

import {
  InboxIcon,
  UserGroupIcon,
  TagIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface CategoryMenuProps {
  current_category?: EmailCategory;
  on_category_change: (category: EmailCategory) => void;
  trigger: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

interface CategoryOption {
  id: EmailCategory;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    id: "primary",
    label: "Primary",
    description: "Important, personal emails",
    icon: InboxIcon,
    color: "text-slate-600 dark:text-slate-400",
  },
  {
    id: "social",
    label: "Social",
    description: "Social network notifications",
    icon: UserGroupIcon,
    color: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "promotions",
    label: "Promotions",
    description: "Marketing, deals, offers",
    icon: TagIcon,
    color: "text-green-600 dark:text-green-400",
  },
  {
    id: "updates",
    label: "Updates",
    description: "Receipts, confirmations",
    icon: BellIcon,
    color: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "forums",
    label: "Forums",
    description: "Mailing lists, discussions",
    icon: ChatBubbleLeftRightIcon,
    color: "text-purple-600 dark:text-purple-400",
  },
];

function CategoryMenu({
  current_category,
  on_category_change,
  trigger,
  align = "start",
  side = "bottom",
}: CategoryMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56" side={side}>
        <DropdownMenuLabel className="text-xs font-medium text-[var(--text-tertiary)]">
          Move to Category
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CATEGORY_OPTIONS.map((option) => {
          const is_current = current_category === option.id;
          const IconComponent = option.icon;

          return (
            <DropdownMenuItem
              key={option.id}
              className={cn(
                "flex items-center gap-2.5 cursor-pointer",
                is_current && "bg-[var(--bg-secondary)]",
              )}
              onClick={() => on_category_change(option.id)}
            >
              <IconComponent
                className={cn("w-4 h-4 flex-shrink-0", option.color)}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  {option.label}
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                  {option.description}
                </div>
              </div>
              {is_current && (
                <CheckIcon className="w-4 h-4 text-[var(--accent-color)] flex-shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface CategoryMenuItemsProps {
  current_category?: EmailCategory;
  on_category_change: (category: EmailCategory) => void;
}

function CategoryMenuItems({
  current_category,
  on_category_change,
}: CategoryMenuItemsProps) {
  return (
    <>
      {CATEGORY_OPTIONS.map((option) => {
        const is_current = current_category === option.id;
        const IconComponent = option.icon;

        return (
          <DropdownMenuItem
            key={option.id}
            className={cn(
              "flex items-center gap-2.5 cursor-pointer",
              is_current && "bg-[var(--bg-secondary)]",
            )}
            onClick={() => on_category_change(option.id)}
          >
            <IconComponent
              className={cn("w-4 h-4 flex-shrink-0", option.color)}
            />
            <span className="flex-1 text-sm">{option.label}</span>
            {is_current && (
              <CheckIcon className="w-4 h-4 text-[var(--accent-color)] flex-shrink-0" />
            )}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export { CategoryMenu, CategoryMenuItems, CATEGORY_OPTIONS };
export type { CategoryMenuProps, CategoryOption };
