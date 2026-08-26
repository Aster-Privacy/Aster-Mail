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
import { useState, useEffect, useCallback, useRef } from "react";
import { commit_on_enter } from "@/lib/commit_on_enter";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Switch, Button } from "@aster/ui";

import { ConsentGateDialog } from "./filters";

import { Input } from "@/components/ui/input";
import { InfoPopover } from "@/components/ui/info_popover";
import { Spinner } from "@/components/ui/spinner";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import {
  get_data_retention,
  update_data_retention,
  type DataRetentionPolicy,
} from "@/services/api/family_org";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { parse_bounded_int } from "@/lib/parse_bounded_int";
import type {} from "@/lib/i18n/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";

const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650;

export function RetentionContent({
  other_member_count,
  initial_retention,
}: {
  other_member_count: number;
  initial_retention?: DataRetentionPolicy | null;
}) {
  const { t } = use_i18n();
  const [policy, set_policy] = useState<DataRetentionPolicy | null>(
    initial_retention ?? null,
  );
  const [server_policy, set_server_policy] =
    useState<DataRetentionPolicy | null>(initial_retention ?? null);
  const [saving, set_saving] = useState(false);
  const [load_failed, set_load_failed] = useState(false);
  const [confirm_enforce, set_confirm_enforce] = useState(false);
  const [consent_open, set_consent_open] = useState(false);
  const [consent_payload, set_consent_payload] =
    useState<DataRetentionPolicy | null>(null);
  const [consent_sent_payload, set_consent_sent_payload] =
    useState<DataRetentionPolicy | null>(null);
  const save_timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending_policy = useRef<DataRetentionPolicy | null>(null);

  const load_policy = useCallback(() => {
    const fall_back = () => {
      set_load_failed(true);
    };

    set_load_failed(false);

    return get_data_retention()
      .then((r) => {
        if (r.data) {
          set_policy(r.data);
          set_server_policy(r.data);
        } else {
          fall_back();
        }
      })
      .catch(fall_back);
  }, []);

  useEffect(() => {
    if (initial_retention) return;

    void load_policy();
  }, [initial_retention, load_policy]);

  const persist = useCallback(
    async (next: DataRetentionPolicy) => {
      set_saving(true);
      try {
        const r = await update_data_retention(next);

        if (r.data) {
          set_policy(r.data);
          set_server_policy(r.data);
          set_consent_sent_payload(null);
        } else {
          if (server_policy) set_policy(server_policy);
          show_toast(t("settings.fam_org_ret_save_failed"), "error");
        }
      } catch {
        if (server_policy) set_policy(server_policy);
        show_toast(t("settings.fam_org_ret_save_failed"), "error");
      } finally {
        set_saving(false);
      }
    },
    [t, server_policy],
  );

  const persist_ref = useRef(persist);

  persist_ref.current = persist;

  const apply = useCallback(
    (next: DataRetentionPolicy, debounce = false) => {
      set_policy(next);
      set_consent_sent_payload(null);
      if (other_member_count > 0 && next.enforce_on_members) {
        return;
      }
      if (save_timer.current) clearTimeout(save_timer.current);
      if (debounce) {
        pending_policy.current = next;
        save_timer.current = setTimeout(() => {
          pending_policy.current = null;
          persist(next);
        }, 600);
      } else {
        pending_policy.current = null;
        persist(next);
      }
    },
    [persist, other_member_count],
  );

  useEffect(
    () => () => {
      if (save_timer.current) clearTimeout(save_timer.current);

      const pending = pending_policy.current;

      pending_policy.current = null;
      if (pending) persist_ref.current(pending);
    },
    [],
  );

  if (!policy && load_failed)
    return <LoadFailedNotice on_retry={() => void load_policy()} />;

  if (!policy)
    return (
      <div className="flex justify-center items-center gap-2 py-8">
        <Spinner size="sm" />
        <span className="text-sm text-txt-muted">
          {t("settings.fam_org_ret_loading")}
        </span>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg bg-surf-secondary px-3 py-2.5 border border-edge-secondary">
        <InformationCircleIcon className="w-4 h-4 text-txt-muted flex-shrink-0 mt-0.5" />
        <p className="text-xs text-txt-muted">
          {t("settings.fam_org_ret_intro")}
        </p>
      </div>
      <div className="divide-y divide-edge-secondary">
        {[
          {
            key: "trash_retention_days" as const,
            label: t("settings.fam_org_ret_trash"),
            hint: t("settings.fam_org_ret_trash_hint"),
            info: t("settings.fam_org_ret_trash_info"),
          },
          {
            key: "spam_retention_days" as const,
            label: t("settings.fam_org_ret_spam"),
            hint: t("settings.fam_org_ret_spam_hint"),
            info: t("settings.fam_org_ret_spam_info"),
          },
          {
            key: "sent_retention_days" as const,
            label: t("settings.fam_org_ret_sent"),
            hint: t("settings.fam_org_ret_sent_hint"),
            info: t("settings.fam_org_ret_sent_info"),
          },
          {
            key: "all_mail_retention_days" as const,
            label: t("settings.fam_org_ret_all_mail"),
            hint: t("settings.fam_org_ret_all_mail_hint"),
            info: t("settings.fam_org_ret_all_mail_info"),
          },
        ].map(({ key, label, hint, info }) => {
          return (
            <div key={key} className="flex items-center justify-between py-4">
              <div className="flex-1 pe-4">
                <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                  {label}
                  <InfoPopover description={info} title={label} />
                </p>
                <p className="text-sm mt-0.5 text-txt-muted">{hint}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Input
                  className="w-20"
                  min="1"
                  placeholder={t("settings.fam_org_ret_off")}
                  type="number"
                  value={(policy[key] as number | null) ?? ""}
                  onBlur={(e) =>
                    apply({
                      ...policy,
                      [key]: parse_bounded_int(
                        e.target.value,
                        MIN_RETENTION_DAYS,
                        MAX_RETENTION_DAYS,
                      ),
                    })
                  }
                  onChange={(e) =>
                    set_policy({
                      ...policy,
                      [key]: parse_bounded_int(
                        e.target.value,
                        MIN_RETENTION_DAYS,
                        MAX_RETENTION_DAYS,
                      ),
                    })
                  }
                  onKeyDown={commit_on_enter}
                />
                <span className="text-xs text-txt-muted">
                  {t("settings.fam_org_ret_days")}
                </span>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.fam_org_ret_enforce")}
              <InfoPopover
                description={t("settings.fam_org_ret_enforce_info_desc")}
                title={t("settings.fam_org_ret_enforce_info_title")}
              />
            </p>
            <p
              className={
                policy.enforce_on_members
                  ? "text-sm mt-0.5 text-amber-500 dark:text-amber-400 font-medium"
                  : "text-sm mt-0.5 text-txt-muted"
              }
            >
              {policy.enforce_on_members
                ? t("settings.fam_org_ret_enforce_on_desc")
                : t("settings.fam_org_ret_enforce_off_desc")}
            </p>
          </div>
          <Switch
            aria-label={t("settings.fam_org_ret_enforce")}
            checked={policy.enforce_on_members}
            size="lg"
            onCheckedChange={(val) => {
              if (val) {
                if (other_member_count > 0) {
                  set_consent_payload({ ...policy, enforce_on_members: true });
                  set_consent_open(true);
                } else {
                  set_confirm_enforce(true);
                }
              } else {
                apply({ ...policy, enforce_on_members: false });
              }
            }}
          />
        </div>
      </div>
      {(() => {
        if (consent_sent_payload) {
          return (
            <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 px-3 py-2.5">
              <p className="text-xs text-amber-700 dark:text-amber-300 flex-1 me-3">
                {t("settings.fam_consent_sent_toast")}
              </p>
            </div>
          );
        }

        const has_enforce_draft =
          other_member_count > 0 &&
          !!policy.enforce_on_members &&
          server_policy !== null &&
          JSON.stringify(policy) !== JSON.stringify(server_policy);

        return has_enforce_draft ? (
          <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 px-3 py-2.5">
            <p className="text-xs text-amber-700 dark:text-amber-300 flex-1 me-3">
              {t("settings.fam_ret_unsaved_consent")}
            </p>
            <div className="flex gap-2 flex-shrink-0">
              <button
                className="aster_btn aster_btn_ghost aster_btn_sm"
                onClick={() => set_policy(server_policy!)}
              >
                {t("settings.fam_org_sec_discard")}
              </button>
              <Button
                size="sm"
                variant="depth"
                onClick={() => {
                  set_consent_payload(policy);
                  set_consent_open(true);
                }}
              >
                {t("settings.fam_ret_request_consent")}
              </Button>
            </div>
          </div>
        ) : null;
      })()}
      {saving && (
        <p className="flex items-center gap-1.5 text-xs text-txt-muted">
          <Spinner size="sm" /> {t("settings.fam_org_ret_saving")}
        </p>
      )}

      <AlertDialog
        open={confirm_enforce}
        onOpenChange={(open) => !open && set_confirm_enforce(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.fam_org_ret_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.fam_org_ret_confirm_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("settings.fam_org_ret_confirm_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                set_confirm_enforce(false);
                apply({ ...policy, enforce_on_members: true });
              }}
            >
              {t("settings.fam_org_ret_confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConsentGateDialog
        description={t("settings.fam_consent_retention_desc")}
        kind="retention_policy"
        member_count={other_member_count}
        on_close={() => {
          set_consent_open(false);
          set_consent_payload(null);
        }}
        on_sent={() => {
          set_consent_sent_payload(consent_payload);
          set_consent_payload(null);
        }}
        open={consent_open}
        payload={consent_payload}
      />
    </div>
  );
}
