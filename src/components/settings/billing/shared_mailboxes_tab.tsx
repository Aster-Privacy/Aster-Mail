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
  ExclamationTriangleIcon,
  InboxStackIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import {
  Island,
  IslandDivider,
  IslandEmpty,
  IslandRow,
  PillButton,
} from "@aster/ui";

import {
  FamilyCreateBar,
  FamilySkeletonRows,
  family_row_icon,
} from "./family_section/family_ui";

import { apply_input_transform } from "@/utils/input_transform";
import { show_toast } from "@/components/toast/simple_toast";
import { ButtonSpinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
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
import { format_bytes, format_number } from "@/lib/utils";
import { ELLIPSIS } from "@/utils/preview_text";
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
  get_grant_signing_keys,
  SHARED_MAILBOX_GRANT_VERSION,
} from "@/services/crypto/shared_mailbox";
import { decrypt_vault } from "@/services/crypto/key_manager_pgp";
import {
  sync_shared_mailbox_grants,
  clear_shared_mailbox_session,
  cache_shared_mailbox_secret,
} from "@/services/shared_mailbox_session";
import { get_session_passphrase } from "@/contexts/auth/session_passphrase";
import { ignore_error } from "@/lib/ignore_error";
import { is_composing } from "@/utils/ime";
import { user_facing_error } from "@/utils/user_facing_error";

const DEFAULT_ALLOCATION_BYTES = 10 * 1024 ** 3;

const mailbox_cache = new Map<
  string,
  { mailboxes: SharedMailboxInfo[]; max_mailboxes: number | null }
>();

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

  const cached = mailbox_cache.get(group.id);
  const [mailboxes, set_mailboxes] = useState<SharedMailboxInfo[]>(
    cached?.mailboxes ?? [],
  );
  const [max_mailboxes, set_max_mailboxes] = useState<number | null>(
    cached?.max_mailboxes ?? null,
  );
  const [load_failed, set_load_failed] = useState(false);
  const [loading, set_loading] = useState(!cached);
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
  const availability_request_ref = useRef(0);

  const active_members = group.members.filter((m) => m.status === "active");
  const me = active_members.find((m) => m.user_id === my_user_id);

  const load = useCallback(async (): Promise<SharedMailboxInfo[]> => {
    const response = await list_shared_mailboxes();

    if (response.data) {
      set_mailboxes(response.data.mailboxes);
      set_max_mailboxes(response.data.max_shared_mailboxes);
      mailbox_cache.set(group.id, {
        mailboxes: response.data.mailboxes,
        max_mailboxes: response.data.max_shared_mailboxes,
      });
      set_load_failed(false);
      set_loading(false);

      return response.data.mailboxes;
    }
    set_load_failed(true);
    set_loading(false);

    return [];
  }, [group.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (availability_timer.current) {
      window.clearTimeout(availability_timer.current);
    }
    const prefix = new_prefix.trim();

    if (prefix.length < 3) {
      availability_request_ref.current += 1;
      set_address_available(null);

      return;
    }
    availability_timer.current = window.setTimeout(async () => {
      const request_id = ++availability_request_ref.current;
      const response = await check_address_availability(prefix, new_domain);

      if (request_id !== availability_request_ref.current) return;
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
    max_mailboxes !== null &&
    max_mailboxes !== -1 &&
    mailboxes.length >= max_mailboxes;

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
        get_grant_signing_keys(),
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

    if (
      prefix.length < 3 ||
      creating ||
      !me ||
      at_mailbox_limit ||
      address_available === false
    ) {
      return;
    }

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
      const signing_key = get_grant_signing_keys();

      const placeholder_grant = await seal_grant(
        {
          v: SHARED_MAILBOX_GRANT_VERSION,
          mailbox_user_id: "pending",
          email: material.email,
          login_secret: material.login_secret,
        },
        my_public_key,
        signing_key,
      );

      const response = await create_shared_mailbox({
        ...material.params,
        wrapped_grant: placeholder_grant,
      });

      if (response.error || !response.data) {
        show_toast(
          response.error || t("shared_mailboxes.create_failed"),
          "error",
        );

        return;
      }

      await cache_shared_mailbox_secret(
        response.data.mailbox_user_id,
        material.login_secret,
        response.data.credential_epoch,
      ).catch((caught) =>
        ignore_error(
          "components/settings/billing/shared_mailboxes_tab:SharedMailboxesTab",
          caught,
        ),
      );

      const owner_grant = await seal_grant(
        {
          v: SHARED_MAILBOX_GRANT_VERSION,
          mailbox_user_id: response.data.mailbox_user_id,
          email: material.email,
          login_secret: material.login_secret,
        },
        my_public_key,
        signing_key,
      );

      let reissue = await add_shared_mailbox_grant(
        response.data.id,
        my_user_id,
        owner_grant,
        response.data.credential_epoch,
      );

      if (reissue.error) {
        reissue = await add_shared_mailbox_grant(
          response.data.id,
          my_user_id,
          owner_grant,
          response.data.credential_epoch,
        );
      }
      if (reissue.error) {
        show_toast(t("shared_mailboxes.created_grant_pending"), "error");
        await load();
        set_expanded(response.data.id);

        return;
      }

      await sync_shared_mailbox_grants().catch((caught) =>
        ignore_error(
          "components/settings/billing/shared_mailboxes_tab:SharedMailboxesTab",
          caught,
        ),
      );
      set_new_prefix("");
      set_address_available(null);
      show_toast(t("shared_mailboxes.created"), "success");
      await load();
      set_expanded(response.data.id);
    } catch (e) {
      show_toast(
        user_facing_error(e, t("shared_mailboxes.create_failed")),
        "error",
      );
    } finally {
      set_creating(false);
    }
  }, [
    new_prefix,
    new_domain,
    creating,
    me,
    my_user_id,
    remaining_pool,
    at_mailbox_limit,
    address_available,
    t,
    load,
  ]);

  const handle_rotate = useCallback(
    async (mailbox_id: string, silent = false): Promise<boolean> => {
      if (busy_mailbox) return false;
      set_busy_mailbox(mailbox_id);
      try {
        const signing_key = get_grant_signing_keys();
        const fresh = await load();
        const mailbox = fresh.find((m) => m.id === mailbox_id);

        if (!mailbox || !mailbox.my_grant) {
          throw new Error(t("shared_mailboxes.access_unavailable"));
        }

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
            signing_key,
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
          expected_vault_updated_at: mailbox.my_grant.vault_updated_at,
          grants,
        });

        if (response.error) {
          if (!silent) {
            show_toast(
              response.code === "CONFLICT"
                ? t("shared_mailboxes.rotate_conflict")
                : t("settings.fam_org_action_failed"),
              "error",
            );
          }

          return false;
        }

        await clear_shared_mailbox_session(mailbox.mailbox_user_id);
        await sync_shared_mailbox_grants().catch((caught) =>
          ignore_error(
            "components/settings/billing/shared_mailboxes_tab:SharedMailboxesTab",
            caught,
          ),
        );
        if (!silent) show_toast(t("shared_mailboxes.rotated"), "success");
        await load();

        return true;
      } catch (e) {
        if (!silent) {
          show_toast(
            user_facing_error(e, t("settings.fam_org_action_failed")),
            "error",
          );
        }

        return false;
      } finally {
        set_busy_mailbox(null);
      }
    },
    [busy_mailbox, t, load],
  );

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
            show_toast(t("settings.fam_org_action_failed"), "error");

            return;
          }
          set_busy_mailbox(null);
          const fully_removed = await handle_rotate(mailbox.id, true);

          show_toast(
            fully_removed
              ? t("shared_mailboxes.grant_revoked")
              : t("shared_mailboxes.revoke_rotation_pending"),
            fully_removed ? "success" : "error",
          );

          return;
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
          user_facing_error(e, t("settings.fam_org_action_failed")),
          "error",
        );
      } finally {
        set_busy_mailbox(null);
      }
    },
    [busy_mailbox, grant_to_member, handle_rotate, t, load],
  );

  const handle_delete = useCallback(async () => {
    const mailbox = pending_delete;

    if (!mailbox) return;
    set_pending_delete(null);
    set_busy_mailbox(mailbox.id);
    try {
      const response = await delete_shared_mailbox(mailbox.id);

      if (response.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");

        return;
      }
      await clear_shared_mailbox_session(mailbox.mailbox_user_id);
      await sync_shared_mailbox_grants().catch((caught) =>
        ignore_error(
          "components/settings/billing/shared_mailboxes_tab:SharedMailboxesTab",
          caught,
        ),
      );
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
      const synced = await sync_shared_mailbox_grants().catch((caught) => {
        ignore_error(
          "components/settings/billing/shared_mailboxes_tab:SharedMailboxesTab",
          caught,
        );

        return [] as SharedMailboxInfo[];
      });

      if (!synced.some((m) => m.mailbox_user_id === mailbox.mailbox_user_id)) {
        show_toast(t("shared_mailboxes.access_unavailable"), "error");

        return;
      }
      await switch_to_account(mailbox.mailbox_user_id);
    },
    [switch_to_account, t],
  );

  const retry_load = () => {
    set_loading(true);
    void load();
  };

  const address_status =
    address_available === true
      ? "success"
      : address_available === false
        ? "error"
        : "default";

  return (
    <div className="flex flex-col gap-4">
      <Island className="flex flex-col gap-3" padding="md">
        <FamilyCreateBar>
          <Input
            aria-label={t("shared_mailboxes.address_placeholder")}
            className="aster_input_tonal sm:flex-1"
            placeholder={t("shared_mailboxes.address_placeholder")}
            status={address_status}
            value={new_prefix}
            onChange={(e) => {
              set_new_prefix(
                apply_input_transform(e.target, (v) =>
                  v.toLowerCase().replace(/[^a-z0-9.]/g, ""),
                ),
              );
              set_address_available(null);
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && !is_composing(e) && handle_create()
            }
          />
          <Select value={new_domain} onValueChange={set_new_domain}>
            <SelectTrigger className="rounded-[var(--aster-radius-field)] sm:w-44">
              <span className="me-0.5 text-txt-muted">@</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="astermail.org">astermail.org</SelectItem>
              <SelectItem value="aster.cx">aster.cx</SelectItem>
            </SelectContent>
          </Select>
          <PillButton
            className="flex-shrink-0"
            disabled={
              creating ||
              !me ||
              at_mailbox_limit ||
              new_prefix.trim().length < 3 ||
              address_available === false
            }
            leading={
              creating ? <ButtonSpinner /> : <PlusIcon className="h-4 w-4" />
            }
            variant="filled"
            onClick={handle_create}
          >
            {t("shared_mailboxes.create")}
          </PillButton>
        </FamilyCreateBar>
        {load_failed ? (
          <button
            className="w-fit text-start text-[12.5px] leading-5 hover:underline"
            style={{ color: "var(--accent-color)" }}
            type="button"
            onClick={retry_load}
          >
            {t("shared_mailboxes.load_failed_retry")}
          </button>
        ) : (
          <p
            className={`text-[12.5px] leading-5 text-txt-muted ${loading ? "invisible" : ""}`}
          >
            {at_mailbox_limit
              ? t("shared_mailboxes.limit_reached", {
                  max: max_mailboxes,
                })
              : t("shared_mailboxes.create_hint", {
                  count: mailboxes.length,
                  max: max_mailboxes === -1 ? "∞" : (max_mailboxes ?? ELLIPSIS),
                })}
          </p>
        )}
      </Island>

      {loading ? (
        <FamilySkeletonRows count={2} />
      ) : load_failed && mailboxes.length === 0 ? (
        <Island padding="lg">
          <IslandEmpty
            action={
              <PillButton size="sm" variant="tonal" onClick={retry_load}>
                {t("common.retry")}
              </PillButton>
            }
            icon={<ExclamationTriangleIcon />}
            title={t("common.something_went_wrong_try_again")}
          />
        </Island>
      ) : mailboxes.length === 0 ? (
        <Island padding="lg">
          <IslandEmpty
            description={t("shared_mailboxes.empty_desc")}
            icon={<InboxStackIcon />}
            title={t("shared_mailboxes.empty_title")}
          />
        </Island>
      ) : (
        <Island className="overflow-hidden" padding="none">
          {mailboxes.map((mailbox, index) => {
            const is_open = expanded === mailbox.id;
            const is_busy = busy_mailbox === mailbox.id;
            const granted_ids = new Set(
              mailbox.grants.map((g) => g.member_user_id),
            );
            const storage_text = t("shared_mailboxes.storage_line", {
              used: format_bytes(mailbox.storage_used_bytes),
              total: format_bytes(mailbox.allocated_storage_bytes),
            });

            return (
              <div key={mailbox.id}>
                {index > 0 && <IslandDivider />}
                <IslandRow
                  aria-expanded={is_open}
                  chevron={false}
                  description={
                    mailbox.rotation_required ? (
                      <span style={{ color: "var(--color-danger)" }}>
                        {t("shared_mailboxes.rotation_needed")}
                      </span>
                    ) : mailbox.status === "frozen" ? (
                      <span style={{ color: "var(--color-warning)" }}>
                        {t("shared_mailboxes.frozen")}
                      </span>
                    ) : (
                      storage_text
                    )
                  }
                  icon={family_row_icon(InboxStackIcon)}
                  label={`${mailbox.username}@${mailbox.email_domain}`}
                  trailing={
                    <span className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1 text-[13px] tabular-nums text-txt-muted">
                        <UsersIcon className="h-4 w-4" />
                        {format_number(mailbox.grants.length)}
                      </span>
                      <ChevronRightIcon
                        className={`h-4 w-4 text-txt-muted transition-transform duration-200 rtl:-scale-x-100 ${is_open ? "rotate-90" : ""}`}
                      />
                    </span>
                  }
                  on_press={() => set_expanded(is_open ? null : mailbox.id)}
                />

                {is_open && (
                  <>
                    {mailbox.rotation_required && mailbox.my_grant && (
                      <div className="px-4 pb-3">
                        <div
                          className="flex flex-col gap-3 rounded-[var(--aster-radius-field)] p-4 sm:flex-row sm:items-center"
                          style={{
                            backgroundColor:
                              "color-mix(in srgb, var(--color-warning) 10%, transparent)",
                          }}
                        >
                          <p className="min-w-0 flex-1 text-[13px] leading-5 text-txt-secondary">
                            {t("shared_mailboxes.rotation_explainer")}
                          </p>
                          <PillButton
                            className="flex-shrink-0 self-start sm:self-auto"
                            disabled={is_busy}
                            leading={
                              is_busy ? (
                                <ButtonSpinner />
                              ) : (
                                <ArrowPathIcon className="h-4 w-4" />
                              )
                            }
                            size="sm"
                            variant="tonal"
                            onClick={() => handle_rotate(mailbox.id)}
                          >
                            {t("shared_mailboxes.rotate")}
                          </PillButton>
                        </div>
                      </div>
                    )}

                    {(mailbox.rotation_required ||
                      mailbox.status === "frozen") && (
                      <p className="px-4 pb-3 text-[13px] text-txt-muted">
                        {storage_text}
                      </p>
                    )}

                    {mailbox.my_grant && mailbox.status === "active" && (
                      <>
                        <IslandDivider />
                        <IslandRow
                          chevron
                          disabled={is_busy}
                          icon={family_row_icon(ArrowRightIcon)}
                          label={t("shared_mailboxes.open")}
                          on_press={() => void handle_open(mailbox)}
                        />
                      </>
                    )}

                    <IslandDivider />
                    <p className="px-4 pb-1 pt-3 text-[12.5px] font-medium text-txt-muted">
                      {t("shared_mailboxes.members_heading")}
                    </p>
                    {active_members.map((member, member_index) => {
                      const has_grant = granted_ids.has(member.user_id);
                      const is_owner_row = member.role === "owner";

                      return (
                        <div key={member.user_id}>
                          {member_index > 0 && <IslandDivider />}
                          <IslandRow
                            icon={
                              <ProfileAvatar
                                email={`${member.username}@${member.email_domain}`}
                                name={member.username}
                                size="xs"
                              />
                            }
                            label={`${member.username}@${member.email_domain}`}
                            trailing={
                              is_owner_row ? (
                                <span className="text-[13px] text-txt-muted">
                                  {t("shared_mailboxes.always_has_access")}
                                </span>
                              ) : (
                                <PillButton
                                  disabled={is_busy}
                                  leading={
                                    has_grant ? (
                                      <CheckIcon className="h-4 w-4" />
                                    ) : undefined
                                  }
                                  size="sm"
                                  variant={has_grant ? "tonal" : "filled"}
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
                                  {has_grant
                                    ? t("shared_mailboxes.has_access")
                                    : t("shared_mailboxes.give_access")}
                                </PillButton>
                              )
                            }
                          />
                        </div>
                      );
                    })}

                    <IslandDivider />
                    <IslandRow
                      destructive
                      chevron={false}
                      disabled={is_busy}
                      icon={family_row_icon(TrashIcon)}
                      label={t("shared_mailboxes.delete_confirm_title")}
                      on_press={() => set_pending_delete(mailbox)}
                    />
                  </>
                )}
              </div>
            );
          })}
        </Island>
      )}

      <ConfirmationModal
        confirm_text={t("shared_mailboxes.delete_confirm_button")}
        is_open={pending_delete !== null}
        message={t("shared_mailboxes.delete_confirm_message", {
          address: pending_delete
            ? `${pending_delete.username}@${pending_delete.email_domain}`
            : "",
        })}
        on_cancel={() => set_pending_delete(null)}
        on_confirm={handle_delete}
        title={t("shared_mailboxes.delete_confirm_title")}
        variant="danger"
      />
    </div>
  );
}
