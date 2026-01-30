import type { Email } from "@/types/email";

import { useMemo } from "react";
import { motion } from "framer-motion";

import { strip_html_tags } from "@/lib/html_sanitizer";
import { ProfileAvatar } from "@/components/ui/profile_avatar";

export function EmailListItem({
  email,
  is_selected,
  on_click,
}: {
  email: Email;
  is_selected: boolean;
  on_click: () => void;
}) {
  const is_unread = !email.is_read;

  const plain_preview = useMemo(() => {
    if (!email.preview) return "";

    return strip_html_tags(email.preview);
  }, [email.preview]);

  return (
    <motion.button
      animate={{ opacity: 1, x: 0 }}
      className={`w-full px-6 py-4 border-b text-left cursor-pointer transition-colors duration-200 ${
        is_selected ? "bg-[var(--bg-tertiary)]" : ""
      }`}
      exit={{ opacity: 0, x: -20 }}
      initial={{ opacity: 0, x: -20 }}
      style={{
        borderColor: "var(--border-secondary)",
      }}
      transition={{ duration: 0.3 }}
      onClick={on_click}
    >
      <div className="flex items-start gap-4">
        <motion.div
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <ProfileAvatar
            use_domain_logo
            email={email.sender.email}
            name={email.sender.name}
            size="md"
          />
        </motion.div>
        <motion.div
          animate={{ opacity: 1 }}
          className="flex-1 min-w-0"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <div className="flex items-center justify-between gap-2">
            <p
              className="font-medium truncate transition-colors"
              style={{
                color: is_unread
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                fontWeight: is_unread ? 600 : 500,
              }}
            >
              {email.sender.name}
            </p>
            <span
              className="text-xs whitespace-nowrap"
              style={{ color: "var(--text-muted)" }}
            >
              {email.timestamp}
            </span>
          </div>
          <p
            className="text-sm truncate transition-colors"
            style={{
              color: is_unread ? "var(--text-primary)" : "var(--text-tertiary)",
              fontWeight: is_unread ? 500 : 400,
            }}
          >
            {email.subject}
          </p>
          <p
            className="text-sm line-clamp-2 mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            {plain_preview}
          </p>
        </motion.div>
        {is_unread && (
          <motion.div
            animate={{ scale: 1, opacity: 1 }}
            className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0 shadow-md"
            exit={{ scale: 0, opacity: 0 }}
            initial={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            whileHover={{ scale: 1.3 }}
          />
        )}
      </div>
    </motion.button>
  );
}
