import type { ReactElement, ComponentType } from "react";

import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUturnLeftIcon,
  EnvelopeOpenIcon,
  ArchiveBoxArrowDownIcon,
  ShieldExclamationIcon,
  TrashIcon,
  InboxIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ActionButtonProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  on_click?: () => void;
  variant?: "default" | "danger";
}

function ActionButton({
  icon: Icon,
  label,
  on_click,
  variant = "default",
}: ActionButtonProps): ReactElement {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            className="h-10 w-10 rounded-lg flex items-center justify-center transition-colors"
            style={{
              backgroundColor: "transparent",
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={on_click}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                variant === "danger"
                  ? "rgba(239, 68, 68, 0.1)"
                  : "rgba(255, 255, 255, 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <Icon
              className={`w-5 h-5 ${variant === "danger" ? "text-red-400" : "text-white"}`}
            />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface SelectionActionIslandProps {
  is_visible: boolean;
  selected_count: number;
  on_archive?: () => void;
  on_unarchive?: () => void;
  on_delete: () => void;
  on_reply?: () => void;
  on_mark_read: () => void;
  on_spam: () => void;
  on_clear_selection?: () => void;
  is_archive_view?: boolean;
}

export function SelectionActionIsland({
  is_visible,
  selected_count,
  on_archive,
  on_unarchive,
  on_delete,
  on_reply,
  on_mark_read,
  on_spam,
  on_clear_selection,
  is_archive_view = false,
}: SelectionActionIslandProps): ReactElement {
  return (
    <AnimatePresence>
      {is_visible && (
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="fixed bottom-6 left-1/2 z-50 flex items-center gap-1 px-2 py-2 rounded-2xl shadow-2xl border"
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          style={{
            backgroundColor: "rgba(30, 30, 30, 0.95)",
            borderColor: "rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            transform: "translateX(-50%)",
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 30,
          }}
        >
          <div className="flex items-center gap-1 px-3 border-r border-white/10">
            <span className="text-sm font-medium text-white tabular-nums">
              {selected_count}
            </span>
            <span className="text-sm text-white/60">selected</span>
          </div>

          <div className="flex items-center gap-0.5 px-1">
            {on_reply && (
              <ActionButton
                icon={ArrowUturnLeftIcon}
                label="Reply"
                on_click={on_reply}
              />
            )}
            <ActionButton
              icon={EnvelopeOpenIcon}
              label="Mark as read"
              on_click={on_mark_read}
            />
            {is_archive_view ? (
              <ActionButton
                icon={InboxIcon}
                label="Move to inbox"
                on_click={on_unarchive}
              />
            ) : (
              <ActionButton
                icon={ArchiveBoxArrowDownIcon}
                label="Archive"
                on_click={on_archive}
              />
            )}
            <ActionButton
              icon={ShieldExclamationIcon}
              label="Report spam"
              on_click={on_spam}
            />
            <ActionButton
              icon={TrashIcon}
              label="Delete"
              variant="danger"
              on_click={on_delete}
            />
          </div>

          {on_clear_selection && (
            <>
              <div className="w-px h-6 bg-white/10" />
              <ActionButton
                icon={XMarkIcon}
                label="Clear selection"
                on_click={on_clear_selection}
              />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
