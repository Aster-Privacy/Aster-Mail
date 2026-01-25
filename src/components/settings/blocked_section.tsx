import { useState, useEffect, useCallback } from "react";
import {
  ArrowPathIcon,
  NoSymbolIcon,
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  list_blocked_senders,
  unblock_sender_by_token,
  bulk_unblock_senders_by_tokens,
  block_sender,
  type DecryptedBlockedSender,
} from "@/services/api/blocked_senders";
import { show_toast } from "@/components/simple_toast";

export function BlockedSection() {
  const [blocked_senders, set_blocked_senders] = useState<
    DecryptedBlockedSender[]
  >([]);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_loading, set_is_loading] = useState(true);
  const [is_unblocking, set_is_unblocking] = useState(false);
  const [search_query, set_search_query] = useState("");
  const [show_add_form, set_show_add_form] = useState(false);
  const [new_email, set_new_email] = useState("");
  const [is_adding, set_is_adding] = useState(false);

  const fetch_blocked_senders = useCallback(async () => {
    try {
      const result = await list_blocked_senders();

      if (result.data) {
        set_blocked_senders(result.data);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    fetch_blocked_senders();
  }, [fetch_blocked_senders]);

  const filtered_senders = blocked_senders.filter((sender) => {
    if (!search_query) return true;
    const query = search_query.toLowerCase();

    return (
      sender.email.toLowerCase().includes(query) ||
      sender.name?.toLowerCase().includes(query)
    );
  });

  const handle_select = (id: string) => {
    const new_selected = new Set(selected_ids);

    if (new_selected.has(id)) {
      new_selected.delete(id);
    } else {
      new_selected.add(id);
    }
    set_selected_ids(new_selected);
  };

  const handle_select_all = () => {
    if (selected_ids.size === filtered_senders.length) {
      set_selected_ids(new Set());
    } else {
      set_selected_ids(new Set(filtered_senders.map((s) => s.id)));
    }
  };

  const handle_unblock = async (sender: DecryptedBlockedSender) => {
    set_is_unblocking(true);
    try {
      const result = await unblock_sender_by_token(sender.sender_token);

      if (result.data?.success) {
        set_blocked_senders((prev) => prev.filter((s) => s.id !== sender.id));
        show_toast(`Unblocked ${sender.email}`, "success");
      }
    } finally {
      set_is_unblocking(false);
    }
  };

  const handle_bulk_unblock = async () => {
    if (selected_ids.size === 0) return;

    set_is_unblocking(true);
    try {
      const tokens = blocked_senders
        .filter((s) => selected_ids.has(s.id))
        .map((s) => s.sender_token);
      const result = await bulk_unblock_senders_by_tokens(tokens);

      if (result.data?.success) {
        set_blocked_senders((prev) =>
          prev.filter((s) => !selected_ids.has(s.id)),
        );
        show_toast(
          `Unblocked ${result.data.unblocked_count} senders`,
          "success",
        );
        set_selected_ids(new Set());
      }
    } finally {
      set_is_unblocking(false);
    }
  };

  const handle_add_blocked = async () => {
    if (!new_email.trim()) return;

    const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email_regex.test(new_email.trim())) {
      show_toast("Please enter a valid email address", "error");

      return;
    }

    set_is_adding(true);
    try {
      const result = await block_sender(new_email.trim());

      if (result.data) {
        set_blocked_senders((prev) => [result.data!, ...prev]);
        set_new_email("");
        set_show_add_form(false);
        show_toast(`Blocked ${result.data.email}`, "success");
      } else if (result.error) {
        show_toast(result.error, "error");
      }
    } finally {
      set_is_adding(false);
    }
  };

  const format_date = (date_string: string) => {
    const date = new Date(date_string);

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (is_loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <ArrowPathIcon
          className="w-6 h-6 animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Blocked Senders
        </h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Emails from blocked senders are automatically filtered from your
          inbox.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--text-muted)" }}
          />
          <Input
            className="pl-9 h-9"
            placeholder="Search blocked senders..."
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {selected_ids.size > 0 && (
            <Button
              className="gap-2"
              disabled={is_unblocking}
              size="sm"
              variant="outline"
              onClick={handle_bulk_unblock}
            >
              {is_unblocking ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <TrashIcon className="w-4 h-4" />
              )}
              Unblock ({selected_ids.size})
            </Button>
          )}
          <Button
            className="gap-2"
            size="sm"
            variant="outline"
            onClick={() => set_show_add_form(!show_add_form)}
          >
            <PlusIcon className="w-4 h-4" />
            Add
          </Button>
        </div>
      </div>

      {show_add_form && (
        <div
          className="flex items-center gap-3 p-4 rounded-lg border"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <Input
            className="flex-1"
            placeholder="Enter email address to block..."
            type="email"
            value={new_email}
            onChange={(e) => set_new_email(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handle_add_blocked();
              }
            }}
          />
          <Button
            disabled={is_adding || !new_email.trim()}
            onClick={handle_add_blocked}
          >
            {is_adding ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              "Block"
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              set_show_add_form(false);
              set_new_email("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {blocked_senders.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-lg border"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <NoSymbolIcon
              className="w-6 h-6"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
          <p
            className="text-[14px] font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            No blocked senders
          </p>
          <p
            className="text-[13px] text-center max-w-[280px]"
            style={{ color: "var(--text-muted)" }}
          >
            Block senders from the profile menu to filter their emails from your
            inbox
          </p>
        </div>
      ) : filtered_senders.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-lg border"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <p
            className="text-[14px] font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            No results found
          </p>
          <p
            className="text-[13px] mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            Try a different search term
          </p>
        </div>
      ) : (
        <div
          className="rounded-lg overflow-hidden border"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          <div
            className="flex items-center px-4 py-2 border-b"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <Checkbox
              checked={selected_ids.size === filtered_senders.length}
              onCheckedChange={handle_select_all}
            />
            <span
              className="ml-3 text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {filtered_senders.length} blocked sender
              {filtered_senders.length === 1 ? "" : "s"}
            </span>
          </div>
          {filtered_senders.map((sender, index) => (
            <div
              key={sender.id}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
              style={{
                borderTop:
                  index > 0 ? "1px solid var(--border-secondary)" : "none",
              }}
            >
              <Checkbox
                checked={selected_ids.has(sender.id)}
                onCheckedChange={() => handle_select(sender.id)}
              />

              <ProfileAvatar
                use_domain_logo
                className="flex-shrink-0"
                email={sender.email}
                name={sender.name || sender.email}
                size="sm"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {sender.name && (
                    <span
                      className="text-[13px] font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {sender.name}
                    </span>
                  )}
                </div>
                <p
                  className="text-[12px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {sender.email}
                </p>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <span
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Blocked {format_date(sender.blocked_at)}
                </span>
                <Button
                  disabled={is_unblocking}
                  size="sm"
                  variant="ghost"
                  onClick={() => handle_unblock(sender)}
                >
                  Unblock
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
