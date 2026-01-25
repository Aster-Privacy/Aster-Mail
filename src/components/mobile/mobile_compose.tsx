import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  XMarkIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { use_platform } from "@/hooks/use_platform";
import { haptic_send_success, haptic_error } from "@/native/haptic_feedback";
import {
  authenticate_biometric,
  is_biometric_send_enabled,
} from "@/native/biometric_auth";
import { enqueue_action } from "@/native/offline_queue";
import {
  get_network_status,
  is_native_platform,
} from "@/native/capacitor_bridge";

interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  data?: string;
}

interface MobileComposeProps {
  is_open: boolean;
  on_close: () => void;
  on_send: (data: ComposeData) => Promise<void>;
  on_save_draft?: (data: ComposeData) => Promise<void>;
  on_discard?: () => void;
  initial_to?: string[];
  initial_cc?: string[];
  initial_bcc?: string[];
  initial_subject?: string;
  initial_body?: string;
  reply_to?: {
    email_id: string;
    subject: string;
    from: string;
  };
  user_email?: string;
}

export interface ComposeData {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachments: Attachment[];
  reply_to_id?: string;
}

export function MobileCompose({
  is_open,
  on_close,
  on_send,
  on_save_draft,
  on_discard,
  initial_to = [],
  initial_cc = [],
  initial_bcc = [],
  initial_subject = "",
  initial_body = "",
  reply_to,
  user_email,
}: MobileComposeProps) {
  const { safe_area_insets } = use_platform();
  const [to, set_to] = useState<string[]>(initial_to);
  const [cc, set_cc] = useState<string[]>(initial_cc);
  const [bcc, set_bcc] = useState<string[]>(initial_bcc);
  const [subject, set_subject] = useState(initial_subject);
  const [body, set_body] = useState(initial_body);
  const [attachments, set_attachments] = useState<Attachment[]>([]);
  const [show_cc, set_show_cc] = useState(
    initial_cc.length > 0 || initial_bcc.length > 0,
  );
  const [show_menu, set_show_menu] = useState(false);
  const [is_sending, set_is_sending] = useState(false);
  const [to_input, set_to_input] = useState("");
  const [cc_input, set_cc_input] = useState("");
  const [bcc_input, set_bcc_input] = useState("");

  const body_ref = useRef<HTMLTextAreaElement>(null);
  const file_input_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (is_open) {
      set_to(initial_to);
      set_cc(initial_cc);
      set_bcc(initial_bcc);
      set_subject(initial_subject);
      set_body(initial_body);
      set_attachments([]);
      set_show_cc(initial_cc.length > 0 || initial_bcc.length > 0);
    }
  }, [
    is_open,
    initial_to,
    initial_cc,
    initial_bcc,
    initial_subject,
    initial_body,
  ]);

  const handle_add_recipient = useCallback(
    (
      input: string,
      setter: React.Dispatch<React.SetStateAction<string[]>>,
      input_setter: React.Dispatch<React.SetStateAction<string>>,
    ) => {
      const trimmed = input.trim();

      if (trimmed && trimmed.includes("@")) {
        setter((prev) => [...prev, trimmed]);
        input_setter("");
      }
    },
    [],
  );

  const handle_remove_recipient = useCallback(
    (email: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
      setter((prev) => prev.filter((e) => e !== email));
    },
    [],
  );

  const handle_attach_files = useCallback(() => {
    file_input_ref.current?.click();
  }, []);

  const handle_file_change = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;

      if (!files) return;

      const new_attachments: Attachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();

        const data = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        new_attachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type,
          data,
        });
      }

      set_attachments((prev) => [...prev, ...new_attachments]);
      e.target.value = "";
    },
    [],
  );

  const handle_remove_attachment = useCallback((id: string) => {
    set_attachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handle_send = useCallback(async () => {
    if (to.length === 0) {
      haptic_error();

      return;
    }

    if (is_biometric_send_enabled()) {
      const authenticated = await authenticate_biometric(
        "Authenticate to send email",
      );

      if (!authenticated) {
        haptic_error();

        return;
      }
    }

    set_is_sending(true);

    const compose_data: ComposeData = {
      to,
      cc,
      bcc,
      subject,
      body,
      attachments,
      reply_to_id: reply_to?.email_id,
    };

    try {
      const network_status = await get_network_status();

      if (!network_status.connected && is_native_platform()) {
        await enqueue_action("send_email", {
          to,
          cc: cc.length > 0 ? cc : undefined,
          bcc: bcc.length > 0 ? bcc : undefined,
          subject,
          body,
          attachments: attachments.map((a) => ({
            name: a.name,
            data: a.data,
            type: a.type,
          })),
        });
        haptic_send_success();
        on_close();

        return;
      }

      await on_send(compose_data);
      haptic_send_success();
      on_close();
    } catch {
      haptic_error();
    } finally {
      set_is_sending(false);
    }
  }, [to, cc, bcc, subject, body, attachments, reply_to, on_send, on_close]);

  const handle_save_draft = useCallback(async () => {
    if (!on_save_draft) return;

    const compose_data: ComposeData = {
      to,
      cc,
      bcc,
      subject,
      body,
      attachments,
      reply_to_id: reply_to?.email_id,
    };

    try {
      await on_save_draft(compose_data);
      on_close();
    } catch {}
  }, [
    to,
    cc,
    bcc,
    subject,
    body,
    attachments,
    reply_to,
    on_save_draft,
    on_close,
  ]);

  const handle_discard = useCallback(() => {
    on_discard?.();
    on_close();
  }, [on_discard, on_close]);

  const format_file_size = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ y: 0 }}
          className="fixed inset-0 z-50 flex flex-col bg-background"
          exit={{ y: "100%" }}
          initial={{ y: "100%" }}
          style={{
            paddingTop: safe_area_insets.top,
            paddingBottom: safe_area_insets.bottom,
          }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          <header className="flex items-center justify-between border-b border-border px-2 py-2">
            <button
              className="rounded-full p-2 hover:bg-muted"
              onClick={on_close}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>

            <div className="flex items-center gap-2">
              <button
                className="rounded-full p-2 hover:bg-muted"
                onClick={handle_attach_files}
              >
                <PaperClipIcon className="h-6 w-6" />
              </button>

              <button
                className={cn(
                  "rounded-full p-2 transition-colors",
                  to.length > 0
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground",
                )}
                disabled={is_sending || to.length === 0}
                onClick={handle_send}
              >
                {is_sending ? (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <PaperAirplaneIcon className="h-6 w-6" />
                )}
              </button>

              <div className="relative">
                <button
                  className="rounded-full p-2 hover:bg-muted"
                  onClick={() => set_show_menu(!show_menu)}
                >
                  <EllipsisVerticalIcon className="h-6 w-6" />
                </button>

                {show_menu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => set_show_menu(false)}
                    />
                    <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-background py-1 shadow-lg">
                      {on_save_draft && (
                        <button
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-muted"
                          onClick={() => {
                            set_show_menu(false);
                            handle_save_draft();
                          }}
                        >
                          Save draft
                        </button>
                      )}
                      <button
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-muted"
                        onClick={() => {
                          set_show_menu(false);
                          handle_discard();
                        }}
                      >
                        <TrashIcon className="h-4 w-4" />
                        Discard
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-border px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">From:</span>
                <span className="text-sm">{user_email}</span>
              </div>
            </div>

            <div className="border-b border-border px-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">To:</span>
                {to.map((email) => (
                  <span
                    key={email}
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-sm"
                  >
                    {email}
                    <button
                      className="ml-1 rounded-full p-0.5 hover:bg-background"
                      onClick={() => handle_remove_recipient(email, set_to)}
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
                  placeholder="Add recipient"
                  type="email"
                  value={to_input}
                  onBlur={() =>
                    handle_add_recipient(to_input, set_to, set_to_input)
                  }
                  onChange={(e) => set_to_input(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      handle_add_recipient(to_input, set_to, set_to_input);
                    }
                  }}
                />
                <button
                  className="text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => set_show_cc(!show_cc)}
                >
                  <ChevronDownIcon
                    className={cn(
                      "h-4 w-4 transition-transform",
                      show_cc && "rotate-180",
                    )}
                  />
                </button>
              </div>
            </div>

            {show_cc && (
              <>
                <div className="border-b border-border px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">Cc:</span>
                    {cc.map((email) => (
                      <span
                        key={email}
                        className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-sm"
                      >
                        {email}
                        <button
                          className="ml-1 rounded-full p-0.5 hover:bg-background"
                          onClick={() => handle_remove_recipient(email, set_cc)}
                        >
                          <XMarkIcon className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
                      type="email"
                      value={cc_input}
                      onBlur={() =>
                        handle_add_recipient(cc_input, set_cc, set_cc_input)
                      }
                      onChange={(e) => set_cc_input(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          handle_add_recipient(cc_input, set_cc, set_cc_input);
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="border-b border-border px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">Bcc:</span>
                    {bcc.map((email) => (
                      <span
                        key={email}
                        className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-sm"
                      >
                        {email}
                        <button
                          className="ml-1 rounded-full p-0.5 hover:bg-background"
                          onClick={() =>
                            handle_remove_recipient(email, set_bcc)
                          }
                        >
                          <XMarkIcon className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
                      type="email"
                      value={bcc_input}
                      onBlur={() =>
                        handle_add_recipient(bcc_input, set_bcc, set_bcc_input)
                      }
                      onChange={(e) => set_bcc_input(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          handle_add_recipient(
                            bcc_input,
                            set_bcc,
                            set_bcc_input,
                          );
                        }
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="border-b border-border px-4 py-2">
              <input
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Subject"
                type="text"
                value={subject}
                onChange={(e) => set_subject(e.target.value)}
              />
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2"
                  >
                    <PaperClipIcon className="h-4 w-4 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{attachment.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format_file_size(attachment.size)}
                      </p>
                    </div>
                    <button
                      className="ml-1 rounded-full p-1 hover:bg-background"
                      onClick={() => handle_remove_attachment(attachment.id)}
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="min-h-[200px] p-4">
              <textarea
                ref={body_ref}
                className="min-h-[200px] w-full resize-none bg-transparent text-sm outline-none"
                placeholder="Compose email"
                value={body}
                onChange={(e) => set_body(e.target.value)}
              />
            </div>
          </div>

          <input
            ref={file_input_ref}
            multiple
            className="hidden"
            type="file"
            onChange={handle_file_change}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
