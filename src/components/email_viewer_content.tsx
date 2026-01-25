import type { Email } from "@/types/email";

import { useMemo } from "react";
import { motion } from "framer-motion";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UnsubscribeBanner } from "@/components/unsubscribe_banner";
import { LockIcon } from "@/components/icons";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";

export function EmailViewerContent({ email }: { email: Email }) {
  const unsubscribe_info = useMemo(() => {
    if (email.unsubscribe_info) {
      return email.unsubscribe_info;
    }

    return detect_unsubscribe_info(
      email.html_content,
      email.body || email.preview,
    );
  }, [email.unsubscribe_info, email.html_content, email.body, email.preview]);

  return (
    <>
      {unsubscribe_info.has_unsubscribe && (
        <UnsubscribeBanner
          sender_email={email.sender.email}
          sender_name={email.sender.name}
          unsubscribe_info={unsubscribe_info}
        />
      )}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4 mb-6"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <ProfileAvatar
            clickable
            email={email.sender.email}
            name={email.sender.name}
            size="lg"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-blue-500 cursor-default">
                      <LockIcon size={20} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <div className="text-xs space-y-1 py-0.5">
                      <div className="font-medium">End-to-end encrypted</div>
                      <div style={{ color: "var(--text-muted)" }}>
                        AES-256-GCM · X25519
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <h2
                className="text-2xl font-semibold break-words"
                style={{ color: "var(--text-primary)" }}
              >
                {email.subject}
              </h2>
            </div>
            <p
              className="font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {email.sender.name}
            </p>
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              {email.sender.email}
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              {email.timestamp}
            </p>
          </div>
        </motion.div>

        <Separator className="my-6" />

        <motion.div
          animate={{ opacity: 1 }}
          className="prose prose-sm max-w-none"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <p
            className="leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--text-secondary)" }}
          >
            {email.preview}
          </p>
        </motion.div>
      </div>
    </>
  );
}
