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
            disabled={is_archive_loading}
            size="icon"
            variant="ghost"
            onClick={on_archive}
          >
            <ArchiveIcon size={18} />
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
          <Button
            disabled={is_spam_loading}
            size="icon"
            variant="ghost"
            onClick={on_spam}
          >
            <SpamIcon size={18} />
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
          <Button
            disabled={is_trash_loading}
            size="icon"
            variant="ghost"
            onClick={on_trash}
          >
            <TrashIcon size={18} />
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
