import type { UnsubscribeInfo } from "@/types/email";

import { motion } from "framer-motion";
import { EnvelopeIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { TrashIcon, ArchiveIcon, SpamIcon } from "@/components/icons";

interface EmailViewerHeaderProps {
  on_close: () => void;
  on_archive?: () => void;
  on_spam?: () => void;
  on_trash?: () => void;
  on_unsubscribe?: () => void;
  is_archive_loading?: boolean;
  is_spam_loading?: boolean;
  is_trash_loading?: boolean;
  unsubscribe_info?: UnsubscribeInfo;
}

export function EmailViewerHeader({
  on_close,
  on_archive,
  on_spam,
  on_trash,
  on_unsubscribe,
  is_archive_loading = false,
  is_spam_loading = false,
  is_trash_loading = false,
  unsubscribe_info,
}: EmailViewerHeaderProps) {
  const show_unsubscribe = unsubscribe_info?.has_unsubscribe && on_unsubscribe;

  return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="flex items-center justify-between px-6 py-4 border-b border-default-200"
      initial={{ y: -10, opacity: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <motion.button
        className="text-blue-500 hover:text-blue-600 font-medium transition-all px-2 py-1 rounded-lg"
        whileHover={{ x: -4, backgroundColor: "rgba(59, 130, 246, 0.08)" }}
        whileTap={{ scale: 0.95 }}
        onClick={on_close}
      >
        ← Back
      </motion.button>
      <div className="flex items-center gap-2">
        {show_unsubscribe && (
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
            <Button
              className="text-violet-500 hover:text-violet-600 hover:bg-violet-500/10"
              size="icon"
              variant="ghost"
              onClick={on_unsubscribe}
            >
              <EnvelopeIcon className="w-[18px] h-[18px]" />
            </Button>
          </motion.div>
        )}
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
          <Button
            aria-label={is_archive_loading ? "Archiving..." : "Archive"}
            disabled={is_archive_loading}
            size="icon"
            variant="ghost"
            onClick={on_archive}
          >
            {is_archive_loading ? (
              <svg
                className="w-[18px] h-[18px] animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <ArchiveIcon size={18} />
            )}
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
          <Button
            aria-label={is_spam_loading ? "Marking as spam..." : "Mark as spam"}
            disabled={is_spam_loading}
            size="icon"
            variant="ghost"
            onClick={on_spam}
          >
            {is_spam_loading ? (
              <svg
                className="w-[18px] h-[18px] animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <SpamIcon size={18} />
            )}
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
          <Button
            aria-label={
              is_trash_loading ? "Moving to trash..." : "Move to trash"
            }
            disabled={is_trash_loading}
            size="icon"
            variant="ghost"
            onClick={on_trash}
          >
            {is_trash_loading ? (
              <svg
                className="w-[18px] h-[18px] animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <TrashIcon size={18} />
            )}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
