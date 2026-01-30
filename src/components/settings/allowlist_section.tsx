import { useState, useEffect, useCallback } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  list_allowed_senders,
  remove_allowed_sender_by_token,
  bulk_remove_allowed_senders_by_tokens,
  allow_sender,
  type DecryptedAllowedSender,
} from "@/services/api/allowed_senders";
import { show_toast } from "@/components/toast/simple_toast";

export function AllowlistSection() {
  const [allowed_senders, set_allowed_senders] = useState<
    DecryptedAllowedSender[]
  >([]);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_loading, set_is_loading] = useState(true);
  const [is_removing, set_is_removing] = useState(false);
  const [search_query, set_search_query] = useState("");
  const [show_add_form, set_show_add_form] = useState(false);
  const [new_value, set_new_value] = useState("");
  const [is_domain, set_is_domain] = useState(false);
  const [is_adding, set_is_adding] = useState(false);

  const fetch_allowed_senders = useCallback(async () => {
    try {
      const result = await list_allowed_senders();

      if (result.data) {
        set_allowed_senders(result.data);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    fetch_allowed_senders();
  }, [fetch_allowed_senders]);

  const filtered_senders = allowed_senders.filter((sender) => {
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

  const handle_remove = async (sender: DecryptedAllowedSender) => {
    set_is_removing(true);
    try {
      const result = await remove_allowed_sender_by_token(sender.sender_token);

      if (result.data?.success) {
        set_allowed_senders((prev) => prev.filter((s) => s.id !== sender.id));
        show_toast(`Removed ${sender.email} from allowlist`, "success");
      }
    } finally {
      set_is_removing(false);
    }
  };

  const handle_bulk_remove = async () => {
    if (selected_ids.size === 0) return;

    set_is_removing(true);
    try {
      const tokens = allowed_senders
        .filter((s) => selected_ids.has(s.id))
        .map((s) => s.sender_token);
      const result = await bulk_remove_allowed_senders_by_tokens(tokens);

      if (result.data?.success) {
        set_allowed_senders((prev) =>
          prev.filter((s) => !selected_ids.has(s.id)),
        );
        show_toast(
          `Removed ${result.data.removed_count} from allowlist`,
          "success",
        );
        set_selected_ids(new Set());
      }
    } finally {
      set_is_removing(false);
    }
  };

  const handle_add_allowed = async () => {
    if (!new_value.trim()) return;

    const value = new_value.trim();

    if (value.length > 254) {
      show_toast("Value is too long", "error");

      return;
    }

    if (is_domain) {
      const domain_regex =
        /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

      if (!domain_regex.test(value) || value.length > 253) {
        show_toast("Please enter a valid domain", "error");

        return;
      }
    } else {
      const email_regex =
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

      if (!email_regex.test(value)) {
        show_toast("Please enter a valid email address", "error");

        return;
      }

      const split_parts = value.split("@");
      const local_part = split_parts[0];

      if (!local_part || local_part.length > 64) {
        show_toast("Email local part is too long", "error");

        return;
      }
    }

    set_is_adding(true);
    try {
      const result = await allow_sender(value, undefined, is_domain);

      if (result.data) {
        set_allowed_senders((prev) => [result.data!, ...prev]);
        set_new_value("");
        set_show_add_form(false);
        set_is_domain(false);
        show_toast(`Added ${result.data.email} to allowlist`, "success");
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
          Allowlist
        </h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Emails from allowed senders will never be marked as spam.
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
            placeholder="Search allowlist..."
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {selected_ids.size > 0 && (
            <Button
              className="gap-2"
              disabled={is_removing}
              size="sm"
              variant="outline"
              onClick={handle_bulk_remove}
            >
              {is_removing ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <TrashIcon className="w-4 h-4" />
              )}
              Remove ({selected_ids.size})
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
          className="space-y-3 p-4 rounded-lg border"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                checked={!is_domain}
                className="w-4 h-4"
                name="type"
                type="radio"
                onChange={() => set_is_domain(false)}
              />
              <span
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                Email address
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                checked={is_domain}
                className="w-4 h-4"
                name="type"
                type="radio"
                onChange={() => set_is_domain(true)}
              />
              <span
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                Entire domain
              </span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Input
              className="flex-1"
              placeholder={
                is_domain
                  ? "Enter domain (e.g., company.com)"
                  : "Enter email address..."
              }
              type={is_domain ? "text" : "email"}
              value={new_value}
              onChange={(e) => set_new_value(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handle_add_allowed();
                }
              }}
            />
            <Button
              disabled={is_adding || !new_value.trim()}
              onClick={handle_add_allowed}
            >
              {is_adding ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                "Add"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                set_show_add_form(false);
                set_new_value("");
                set_is_domain(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {allowed_senders.length === 0 ? (
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
            <CheckCircleIcon
              className="w-6 h-6"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
          <p
            className="text-[14px] font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            No allowed senders
          </p>
          <p
            className="text-[13px] text-center max-w-[280px]"
            style={{ color: "var(--text-muted)" }}
          >
            Add senders or domains to ensure their emails always reach your
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
              {filtered_senders.length} allowed sender
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

              {sender.is_domain ? (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "var(--bg-tertiary)" }}
                >
                  <GlobeAltIcon
                    className="w-4 h-4"
                    style={{ color: "var(--text-muted)" }}
                  />
                </div>
              ) : (
                <ProfileAvatar
                  use_domain_logo
                  className="flex-shrink-0"
                  email={sender.email}
                  name={sender.name || sender.email}
                  size="sm"
                />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px] font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {sender.is_domain ? `*.${sender.email}` : sender.email}
                  </span>
                  {sender.is_domain && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--accent-blue-muted)",
                        color: "var(--accent-blue)",
                      }}
                    >
                      Domain
                    </span>
                  )}
                </div>
                {sender.name && !sender.is_domain && (
                  <p
                    className="text-[12px] truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {sender.name}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <span
                  className="text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Added {format_date(sender.allowed_at)}
                </span>
                <Button
                  disabled={is_removing}
                  size="sm"
                  variant="ghost"
                  onClick={() => handle_remove(sender)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
