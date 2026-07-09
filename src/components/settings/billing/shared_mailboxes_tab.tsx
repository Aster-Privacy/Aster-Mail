//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  InboxStackIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";
import {
  check_address_availability,
  type FamilyGroupResponse,
} from "@/services/api/family";
import {
  list_shared_mailboxes,
  create_shared_mailbox,
  add_shared_mailbox_grant,
  revoke_shared_mailbox_grant,
  rotate_shared_mailbox,
  delete_shared_mailbox,
  type SharedMailboxInfo,
} from "@/services/api/shared_mailboxes";
import {
  generate_shared_mailbox_material,
  fetch_member_public_key,
  seal_grant,
  generate_rotated_credential,
  SHARED_MAILBOX_GRANT_VERSION,
} from "@/services/crypto/shared_mailbox";
import { decrypt_vault } from "@/services/crypto/key_manager_pgp";
import {
  sync_shared_mailbox_grants,
  clear_shared_mailbox_session,
} from "@/services/shared_mailbox_session";
import { get_session_passphrase } from "@/contexts/auth/session_passphrase";

const DEFAULT_ALLOCATION_BYTES = 10 * 1024 ** 3;

interface SharedMailboxesTabProps {
  group: FamilyGroupResponse;
  my_user_id: string;
}

export function SharedMailboxesTab({
  group,
  my_user_id,
}: SharedMailboxesTabProps) {
  const { t } = use_i18n();
  const { switch_to_account } = use_auth();

  const [mailboxes, set_mailboxes] = useState<SharedMailboxInfo[]>([]);
  const [max_mailboxes, set_max_mailboxes] = useState(0);
  const [loading, set_loading] = useState(true);
  const [creating, set_creating] = useState(false);
  const [expanded, set_expanded] = useState<string | null>(null);
  const [new_prefix, set_new_prefix] = useState("");
  const [new_domain, set_new_domain] = useState("astermail.org");
  const [address_available, set_address_available] = useState<boolean | null>(
    null,
  );
  const [busy_mailbox, set_busy_mailbox] = useState<string | null>(null);
  const [pending_delete, set_pending_delete] =
    useState<SharedMailboxInfo | null>(null);
  const availability_timer = useRef<number | null>(null);

  const active_members = group.members.filter((m) => m.status === "active");
  const me = active_members.find((m) => m.user_id === my_user_id);

  const load = useCallback(async () => {
    const response = await list_shared_mailboxes();

    if (response.data) {
      set_mailboxes(response.data.mailboxes);
      set_max_mailboxes(response.data.max_shared_mailboxes);
    }
    set_loading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (availability_timer.current) {
      window.clearTimeout(availability_timer.current);
    }
    const prefix = new_prefix.trim();

    if (prefix.length < 3) {
      set_address_available(null);

      return;
    }
    availability_timer.current = window.setTimeout(async () => {
      const response = await check_address_availability(prefix, new_domain);

      set_address_available(response.data ? response.data.available : null);
    }, 450);

    return () => {
      if (availability_timer.current) {
        window.clearTimeout(availability_timer.current);
      }
    };
  }, [new_prefix, new_domain]);

  const remaining_pool = Math.max(
    0,
    group.storage_pool_bytes -
      group.members.reduce((s, m) => s + m.allocated_storage_bytes, 0),
  );
  const at_mailbox_limit =
    max_mailboxes !== -1 && mailboxes.length >= max_mailboxes;

  const grant_to_member = useCallback(
    async (
      mailbox: SharedMailboxInfo,
      member_user_id: string,
      username: string,
      email_domain: string,
    ) => {
      const login_secret = await get_session_passphrase(
        mailbox.mailbox_user_id,
      );

      if (!login_secret) {
        throw new Error(t("shared_mailboxes.access_unavailable"));
      }

      const email = `${username}@${email_domain}`;
      const public_key = await fetch_member_public_key(username, email);
      const wrapped = await seal_grant(
        {
          v: SHARED_MAILBOX_GRANT_VERSION,
          mailbox_user_id: mailbox.mailbox_user_id,
          email: `${mailbox.username}@${mailbox.email_domain}`,
          login_secret,
        },
        public_key,
      );

      const response = await add_shared_mailbox_grant(
        mailbox.id,
        member_user_id,
        wrapped,
        mailbox.credential_epoch,
      );

      if (response.error) {
        throw new Error(response.error);
      }
    },
    [t],
  );

  const handle_create = useCallback(async () => {
    const prefix = new_prefix.trim();

    if (prefix.length < 3 || creating || !me) return;

    set_creating(true);
    try {
      const allocation = Math.min(DEFAULT_ALLOCATION_BYTES, remaining_pool);
      const material = await generate_shared_mailbox_material(
        prefix,
        new_domain,
        allocation,
      );

      const my_email = `${me.username}@${me.email_domain}`;
      const my_public_key = await fetch_member_public_key(
        me.username,
        my_email,
      );

      const placeholder_payload = {
        v: SHARED_MAILBOX_GRANT_VERSION,
        mailbox_user_id: "",
        email: material.email,
        login_secret: material.login_secret,
      };
      const wrapped_grant = await seal_grant(
        placeholder_payload,
        my_public_key,
      );

      const response = await create_shared_mailbox({
        ...material.params,
        wrapped_grant,
      });

      if (response.error || !response.data) {
        show_toast(
          response.error || t("shared_mailboxes.create_failed"),
          "error",
        );

        return;
      }

      await sync_shared_mailbox_grants().catch(() => {});
      set_new_prefix("");
      set_address_available(null);
      show_toast(t("shared_mailboxes.created"), "success");
      await load();
      set_expanded(response.data.id);
    } catch (e) {
      show_toast(
        e instanceof Error ? e.message : t("shared_mailboxes.create_failed"),
        "error",
      );
    } finally {
      set_creating(false);
    }
  }, [new_prefix, new_domain, creating, me, remaining_pool, t, load]);

  const handle_toggle_member = useCallback(
    async (
      mailbox: SharedMailboxInfo,
      member_user_id: string,
      username: string,
      email_domain: string,
      has_grant: boolean,
    ) => {
      if (busy_mailbox) return;
      set_busy_mailbox(mailbox.id);
      try {
        if (has_grant) {
          const response = await revoke_shared_mailbox_grant(
            mailbox.id,
            member_user_id,
          );

          if (response.error) {
            show_toast(response.error, "error");

            return;
          }
          show_toast(t("shared_mailboxes.grant_revoked"), "success");
        } else {
          await grant_to_member(
            mailbox,
            member_user_id,
            username,
            email_domain,
          );
          show_toast(t("shared_mailboxes.grant_added"), "success");
        }
        await load();
      } catch (e) {
        show_toast(
          e instanceof Error ? e.message : t("settings.fam_org_action_failed"),
          "error",
        );
      } finally {
        set_busy_mailbox(null);
      }
    },
    [busy_mailbox, grant_to_member, t, load],
  );

  const handle_rotate = useCallback(
    async (mailbox: SharedMailboxInfo) => {
      if (busy_mailbox || !mailbox.my_grant) return;
      set_busy_mailbox(mailbox.id);
      try {
        const old_secret = await get_session_passphrase(
          mailbox.mailbox_user_id,
        );

        if (!old_secret) {
          throw new Error(t("shared_mailboxes.access_unavailable"));
        }

        const vault = await decrypt_vault(
          mailbox.my_grant.encrypted_vault,
          mailbox.my_grant.vault_nonce,
          old_secret,
        );
        const rotated = await generate_rotated_credential(vault, old_secret);

        const grants: { member_user_id: string; wrapped_grant: string }[] = [];

        for (const grant of mailbox.grants) {
          if (!grant.username || !grant.email_domain) continue;
          const member_email = `${grant.username}@${grant.email_domain}`;
          const public_key = await fetch_member_public_key(
            grant.username,
            member_email,
          );
          const wrapped = await seal_grant(
            {
              v: SHARED_MAILBOX_GRANT_VERSION,
              mailbox_user_id: mailbox.mailbox_user_id,
              email: `${mailbox.username}@${mailbox.email_domain}`,
              login_secret: rotated.login_secret,
            },
            public_key,
          );

          grants.push({
            member_user_id: grant.member_user_id,
            wrapped_grant: wrapped,
          });
        }

        const response = await rotate_shared_mailbox(mailbox.id, {
          password_hash: rotated.password_hash,
          password_salt: rotated.password_salt,
          argon2_params: { memory: 65536, iterations: 3, parallelism: 4 },
          encrypted_vault: rotated.encrypted_vault,
          vault_nonce: rotated.vault_nonce,
          vault_format: 2,
          grants,
        });

        if (response.error) {
          show_toast(response.error, "error");

          return;
        }

        await clear_shared_mailbox_session(mailbox.mailbox_user_id);
        await sync_shared_mailbox_grants().catch(() => {});
        show_toast(t("shared_mailboxes.rotated"), "success");
        await load();
      } catch (e) {
        show_toast(
          e instanceof Error ? e.message : t("settings.fam_org_action_failed"),
          "error",
        );
      } finally {
        set_busy_mailbox(null);
      }
    },
    [busy_mailbox, t, load],
  );

  const handle_delete = useCallback(async () => {
    const mailbox = pending_delete;

    if (!mailbox) return;
    set_pending_delete(null);
    set_busy_mailbox(mailbox.id);
    try {
      const response = await delete_shared_mailbox(mailbox.id);

      if (response.error) {
        show_toast(response.error, "error");

        return;
      }
      await clear_shared_mailbox_session(mailbox.mailbox_user_id);
      await sync_shared_mailbox_grants().catch(() => {});
      show_toast(t("shared_mailboxes.deleted"), "success");
      await load();
    } catch {
      show_toast(t("settings.fam_org_action_failed"), "error");
    } finally {
      set_busy_mailbox(null);
    }
  }, [pending_delete, t, load]);

  const handle_open = useCallback(
    async (mailbox: SharedMailboxInfo) => {
      await sync_shared_mailbox_grants().catch(() => {});
      await switch_to_account(mailbox.mailbox_user_id);
    },
    [switch_to_account],
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-start">
        <div
          className={`flex items-center h-9 rounded-xl border bg-white dark:bg-white/[0.04] overflow-hidden flex-1 min-w-0 ${address_available === true ? "border-green-500" : address_available === false ? "border-red-500" : "border-black/10 dark:border-white/10"}`}
        >
          <input
            className="bg-transparent text-sm text-txt-primary outline-none px-3 h-full flex-1 min-w-0 placeholder:text-txt-muted"
            placeholder={t("shared_mailboxes.address_placeholder")}
            value={new_prefix}
            onChange={(e) => {
              set_new_prefix(
                e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""),
              );
              set_address_available(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handle_create()}
          />
          <span className="text-txt-muted text-sm px-1 select-none shrink-0">
            @
          </span>
          <Select value={new_domain} onValueChange={set_new_domain}>
            <SelectTrigger className="border-0 border-l border-black/10 dark:border-white/10 rounded-none bg-transparent h-full shadow-none text-sm min-w-0 max-w-[160px] px-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="astermail.org">astermail.org</SelectItem>
              <SelectItem value="aster.cx">aster.cx</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={
            creating ||
            at_mailbox_limit ||
            new_prefix.trim().length < 3 ||
            address_available === false
          }
          size="md"
          variant="depth"
          onClick={handle_create}
        >
          {creating ? (
            <Spinner size="sm" />
          ) : (
            <PlusIcon className="w-4 h-4" />
          )}{" "}
          {t("shared_mailboxes.create")}
        </Button>
      </div>
      <p className="text-[11px] text-txt-muted">
        {at_mailbox_limit
          ? t("shared_mailboxes.limit_reached", {
              max: String(max_mailboxes),
            })
          : t("shared_mailboxes.create_hint", {
              count: String(mailboxes.length),
              max: max_mailboxes === -1 ? "∞" : String(max_mailboxes),
            })}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-6 justify-center">
          <Spinner size="sm" />
        </div>
      ) : mailboxes.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <InboxStackIcon className="w-12 h-12 text-txt-muted" />
          <p className="text-sm font-medium text-txt-primary">
            {t("shared_mailboxes.empty_title")}
          </p>
          <p className="text-xs text-txt-muted text-center max-w-xs">
            {t("shared_mailboxes.empty_desc")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {mailboxes.map((mailbox) => {
            const is_open = expanded === mailbox.id;
            const is_busy = busy_mailbox === mailbox.id;
            const granted_ids = new Set(
              mailbox.grants.map((g) => g.member_user_id),
            );

            return (
              <div
                key={mailbox.id}
                className="rounded-xl border border-edge-secondary overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                    onClick={() =>
                      set_expanded(is_open ? null : mailbox.id)
                    }
                  >
                    <ChevronRightIcon
                      className={`w-3.5 h-3.5 text-txt-muted flex-shrink-0 transition-transform duration-200 ${is_open ? "rotate-90" : ""}`}
                    />
                    <InboxStackIcon className="w-4 h-4 text-accent-blue flex-shrink-0" />
                    <span className="text-sm font-medium text-txt-primary truncate">
                      {mailbox.username}@{mailbox.email_domain}
                    </span>
                    {mailbox.status === "frozen" && (
                      <span className="aster_badge aster_badge_amber flex-shrink-0">
                        {t("shared_mailboxes.frozen")}
                      </span>
                    )}
                    {mailbox.rotation_required && (
                      <span className="aster_badge aster_badge_red flex-shrink-0">
                        {t("shared_mailboxes.rotation_needed")}
                      </span>
                    )}
                  </button>
                  <span className="aster_badge aster_badge_gray flex-shrink-0 text-xs flex items-center gap-1">
                    <UsersIcon className="w-3 h-3" />
                    {mailbox.grants.length}
                  </span>
                  {mailbox.my_grant && mailbox.status === "active" && (
                    <button
                      className="aster_btn aster_btn_ghost aster_btn_sm flex items-center gap-1 text-accent-blue flex-shrink-0"
                      disabled={is_busy}
                      onClick={() => handle_open(mailbox)}
                    >
                      <ArrowRightIcon className="w-3.5 h-3.5" />
                      {t("shared_mailboxes.open")}
                    </button>
                  )}
                  <button
                    className="aster_btn aster_btn_ghost aster_btn_sm flex items-center gap-1 text-txt-muted hover:text-red-500 flex-shrink-0"
                    disabled={is_busy}
                    onClick={() => set_pending_delete(mailbox)}
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {is_open && (
                  <div className="border-t border-edge-secondary px-4 py-3 space-y-3">
                    {mailbox.rotation_required && mailbox.my_grant && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10">
                        <p className="text-xs text-txt-secondary flex-1">
                          {t("shared_mailboxes.rotation_explainer")}
                        </p>
                        <Button
                          disabled={is_busy}
                          size="sm"
                          variant="outline"
                          onClick={() => handle_rotate(mailbox)}
                        >
                          {is_busy ? (
                            <Spinner size="sm" />
                          ) : (
                            <ArrowPathIcon className="w-3.5 h-3.5" />
                          )}{" "}
                          {t("shared_mailboxes.rotate")}
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-txt-muted">
                      <span>
                        {t("shared_mailboxes.storage_line", {
                          used: format_bytes(mailbox.storage_used_bytes),
                          total: format_bytes(
                            mailbox.allocated_storage_bytes,
                          ),
                        })}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-txt-secondary mb-1.5">
                        {t("shared_mailboxes.members_heading")}
                      </p>
                      <div className="space-y-1">
                        {active_members.map((member) => {
                          const has_grant = granted_ids.has(member.user_id);
                          const is_owner_row = member.role === "owner";

                          return (
                            <div
                              key={member.user_id}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                            >
                              <span className="text-sm text-txt-primary flex-1 min-w-0 truncate">
                                {member.username}@{member.email_domain}
                              </span>
                              {is_owner_row ? (
                                <span className="aster_badge aster_badge_blue text-xs">
                                  {t("shared_mailboxes.always_has_access")}
                                </span>
                              ) : (
                                <Button
                                  disabled={is_busy}
                                  size="sm"
                                  variant={has_grant ? "outline" : "depth"}
                                  onClick={() =>
                                    handle_toggle_member(
                                      mailbox,
                                      member.user_id,
                                      member.username,
                                      member.email_domain,
                                      has_grant,
                                    )
                                  }
                                >
                                  {has_grant ? (
                                    <>
                                      <CheckIcon className="w-3.5 h-3.5" />
                                      {t("shared_mailboxes.has_access")}
                                    </>
                                  ) : (
                                    t("shared_mailboxes.give_access")
                                  )}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationModal
        confirm_text={t("shared_mailboxes.delete_confirm_button")}
        is_open={pending_delete !== null}
        message={t("shared_mailboxes.delete_confirm_message", {
          address: pending_delete
            ? `${pending_delete.username}@${pending_delete.email_domain}`
            : "",
        })}
        title={t("shared_mailboxes.delete_confirm_title")}
        variant="danger"
        on_cancel={() => set_pending_delete(null)}
        on_confirm={handle_delete}
      />
    </div>
  );
}
