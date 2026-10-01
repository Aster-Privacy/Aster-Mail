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
import { Island, IslandEmpty, IslandRow, PillButton } from "@aster/ui";
import { useState, useEffect, useCallback } from "react";
import { GlobeAltIcon, PlusIcon } from "@heroicons/react/24/outline";

import {
  FamilyCreateBar,
  FamilySkeletonRows,
  FamilyStatusText,
} from "./family_ui";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  list_family_domains,
  share_domain,
  revoke_domain_share,
  type FamilyDomain,
} from "@/services/api/family_org";
import { type FamilyMemberInfo } from "@/services/api/family";
import { show_toast } from "@/components/toast/simple_toast";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { use_i18n } from "@/lib/i18n/context";
import type {} from "@/lib/i18n/types";

export function DomainsContent({ members }: { members: FamilyMemberInfo[] }) {
  const { t } = use_i18n();
  const [domains, set_domains] = useState<FamilyDomain[]>([]);
  const [loading, set_loading] = useState(true);
  const [load_failed, set_load_failed] = useState(false);
  const [sharing, set_sharing] = useState<string | null>(null);
  const [share_uid, set_share_uid] = useState("");

  const load = useCallback(() => {
    set_loading(true);
    list_family_domains()
      .then((r) => {
        if (r.data) {
          set_domains(r.data);
          set_load_failed(false);
        } else {
          set_load_failed(true);
        }
      })
      .catch(() => set_load_failed(true))
      .finally(() => set_loading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const do_share = async (dn: string) => {
    if (!share_uid) return;
    const uid = share_uid;

    try {
      const r = await share_domain(dn, uid, true);

      if (r.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");

        return;
      }
      set_domains((d) =>
        d.map((x) =>
          x.domain_name === dn
            ? {
                ...x,
                shared_with_user_ids: x.shared_with_user_ids.includes(uid)
                  ? x.shared_with_user_ids
                  : [...x.shared_with_user_ids, uid],
                shared_with_count: x.shared_with_user_ids.includes(uid)
                  ? x.shared_with_user_ids.length
                  : x.shared_with_user_ids.length + 1,
              }
            : x,
        ),
      );
      set_sharing(null);
      set_share_uid("");
      show_toast(t("settings.fam_org_domains_shared"), "success");
    } catch {
      show_toast(t("settings.fam_org_domains_share_failed"), "error");
    }
  };

  const do_revoke = async (dn: string, uid: string) => {
    try {
      const r = await revoke_domain_share(dn, uid);

      if (r.error) {
        show_toast(t("settings.fam_org_action_failed"), "error");

        return;
      }
      set_domains((d) =>
        d.map((x) =>
          x.domain_name === dn
            ? {
                ...x,
                shared_with_user_ids: x.shared_with_user_ids.filter(
                  (id) => id !== uid,
                ),
                shared_with_count: Math.max(
                  0,
                  x.shared_with_user_ids.filter((id) => id !== uid).length,
                ),
              }
            : x,
        ),
      );
      show_toast(t("settings.fam_org_domains_revoked"), "success");
    } catch {
      show_toast(t("settings.fam_org_domains_revoke_failed"), "error");
    }
  };

  const nav_aliases = () => {
    window.dispatchEvent(
      new CustomEvent("navigate-settings", { detail: "domains" }),
    );
  };

  const member_email = (m: FamilyMemberInfo) =>
    `${m.username}@${m.email_domain}`;

  const shared_members = (d: FamilyDomain) =>
    d.shared_with_user_ids
      .map((uid) => members.find((m) => m.user_id === uid))
      .filter((m): m is FamilyMemberInfo => !!m);

  if (loading) return <FamilySkeletonRows count={3} />;

  if (load_failed && domains.length === 0) {
    return <LoadFailedNotice on_retry={load} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {domains.length === 0 ? (
        <Island padding="lg">
          <IslandEmpty
            action={
              <PillButton
                leading={<PlusIcon className="h-4 w-4" />}
                size="sm"
                type="button"
                onClick={nav_aliases}
              >
                {t("settings.fam_org_domains_add_domain")}
              </PillButton>
            }
            description={t("settings.fam_org_domains_empty_desc")}
            icon={<GlobeAltIcon />}
            title={t("settings.fam_org_domains_empty_title")}
          />
        </Island>
      ) : (
        <Island divided className="overflow-hidden" padding="none">
          {domains.map((d) => {
            const owner = members.find((m) => m.user_id === d.owner_user_id);
            const shared = shared_members(d);

            return (
              <div key={d.domain_name}>
                <IslandRow
                  description={
                    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span>
                        {t("settings.fam_org_domains_owned_by", {
                          name: d.owner_username,
                        })}
                      </span>
                      {shared.length > 0 && (
                        <span className="inline-flex items-center">
                          {shared.map((m) => (
                            <span
                              key={m.user_id}
                              className="-ms-1 rounded-full first:ms-0"
                              title={member_email(m)}
                            >
                              <ProfileAvatar
                                email={member_email(m)}
                                name={m.username}
                                size="xs"
                              />
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  }
                  icon={
                    <ProfileAvatar
                      email={owner ? member_email(owner) : undefined}
                      name={d.owner_username}
                      size="xs"
                    />
                  }
                  label={d.domain_name}
                  trailing={
                    <span className="flex items-center gap-3">
                      {d.dkim_verified ? (
                        <FamilyStatusText tone="success">
                          {t("settings.fam_org_domains_verified")}
                        </FamilyStatusText>
                      ) : (
                        <FamilyStatusText tone="warning">
                          {t("settings.fam_org_domains_unverified")}
                        </FamilyStatusText>
                      )}
                      <PillButton
                        size="sm"
                        type="button"
                        variant="tonal"
                        onClick={() => {
                          if (!d.dkim_verified) {
                            show_toast(
                              t(
                                "settings.fam_org_domains_share_disabled_title",
                              ),
                              "error",
                            );

                            return;
                          }
                          set_sharing(d.domain_name);
                          set_share_uid("");
                        }}
                      >
                        {t("settings.fam_org_domains_share")}
                      </PillButton>
                    </span>
                  }
                />
                {sharing === d.domain_name && (
                  <div className="flex flex-col gap-3 px-4 pb-4">
                    <FamilyCreateBar>
                      <Select
                        value={share_uid || "_none"}
                        onValueChange={(v) =>
                          set_share_uid(v === "_none" ? "" : v)
                        }
                      >
                        <SelectTrigger className="h-10 rounded-[var(--aster-radius-field)] sm:flex-1">
                          <SelectValue
                            placeholder={t(
                              "settings.fam_org_domains_add_member_placeholder",
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {members
                            .filter((m) => m.user_id !== d.owner_user_id)
                            .map((m) => (
                              <SelectItem key={m.user_id} value={m.user_id}>
                                {m.username}@{m.email_domain}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <PillButton
                        disabled={!share_uid}
                        type="button"
                        onClick={() => do_share(d.domain_name)}
                      >
                        {t("settings.fam_org_domains_add_btn")}
                      </PillButton>
                      <PillButton
                        type="button"
                        variant="ghost"
                        onClick={() => set_sharing(null)}
                      >
                        {t("settings.fam_org_domains_done")}
                      </PillButton>
                    </FamilyCreateBar>
                    {shared.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <p className="text-[12.5px] font-medium text-txt-muted">
                          {t("settings.fam_org_domains_shared_with")}
                        </p>
                        {shared.map((m) => (
                          <div
                            key={m.user_id}
                            className="flex min-h-10 items-center gap-3"
                          >
                            <ProfileAvatar
                              email={member_email(m)}
                              name={m.username}
                              size="xs"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm text-txt-primary">
                              {member_email(m)}
                            </span>
                            <PillButton
                              size="sm"
                              type="button"
                              variant="danger"
                              onClick={() =>
                                do_revoke(d.domain_name, m.user_id)
                              }
                            >
                              {t("settings.fam_org_domains_revoke")}
                            </PillButton>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Island>
      )}
      <p className="ms-1 text-[12.5px] text-txt-muted">
        {t("settings.fam_org_domains_subtitle")}
      </p>
    </div>
  );
}
