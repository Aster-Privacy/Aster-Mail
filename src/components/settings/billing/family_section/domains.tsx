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
import { useState, useEffect } from "react";
import { GlobeAltIcon } from "@heroicons/react/24/outline";

import { Spinner } from "@/components/ui/spinner";
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
import { use_i18n } from "@/lib/i18n/context";
import type {} from "@/lib/i18n/types";

import { ignore_error } from "@/lib/ignore_error";

export function DomainsContent({ members }: { members: FamilyMemberInfo[] }) {
  const { t } = use_i18n();
  const [domains, set_domains] = useState<FamilyDomain[]>([]);
  const [loading, set_loading] = useState(true);
  const [sharing, set_sharing] = useState<string | null>(null);
  const [share_uid, set_share_uid] = useState("");

  useEffect(() => {
    list_family_domains()
      .then((r) => {
        if (r.data) set_domains(r.data);
        else show_toast(t("settings.fam_org_domains_load_failed"), "error");
      })
      .catch(() =>
        show_toast(t("settings.fam_org_domains_load_failed"), "error"),
      )
      .finally(() => set_loading(false));
  }, [t]);

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
    try {
      sessionStorage.setItem("alias_tab", "domains");
    } catch (caught) {
      ignore_error(
        "components/settings/billing/family_section/domains:nav_aliases",
        caught,
      );
    }
    window.dispatchEvent(
      new CustomEvent("navigate-settings", { detail: "aliases" }),
    );
  };

  if (loading)
    return (
      <div className="flex justify-center items-center gap-2 py-8">
        <Spinner size="sm" />
        <span className="text-sm text-txt-muted">
          {t("settings.fam_org_domains_loading")}
        </span>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-xs text-txt-muted">
        {t("settings.fam_org_domains_subtitle")}
      </p>
      {domains.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <GlobeAltIcon className="w-8 h-8 text-txt-muted" />
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.fam_org_domains_empty_title")}
          </p>
          <p className="text-xs text-txt-muted text-center max-w-xs">
            {t("settings.fam_org_domains_empty_desc")}
          </p>
          <button
            className="aster_btn aster_btn_primary aster_btn_sm mt-1"
            onClick={nav_aliases}
          >
            {t("settings.fam_org_domains_add_domain")}
          </button>
        </div>
      ) : (
        <div className="divide-y divide-edge-secondary">
          {domains.map((d) => {
            return (
              <div
                key={d.domain_name}
                className="py-3 hover:bg-surf-secondary transition-colors rounded-lg px-2 -mx-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProfileAvatar
                      email={(() => {
                        const om = members.find(
                          (m) => m.user_id === d.owner_user_id,
                        );

                        return om
                          ? `${om.username}@${om.email_domain}`
                          : undefined;
                      })()}
                      name={d.owner_username}
                      size="xs"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-txt-primary">
                          {d.domain_name}
                        </span>
                        {d.dkim_verified ? (
                          <span className="aster_badge aster_badge_green">
                            {t("settings.fam_org_domains_verified")}
                          </span>
                        ) : (
                          <span className="aster_badge aster_badge_amber">
                            {t("settings.fam_org_domains_unverified")}
                          </span>
                        )}
                        {d.shared_with_user_ids.length > 0 && (
                          <div className="flex items-center gap-0.5">
                            {d.shared_with_user_ids
                              .map((uid) =>
                                members.find((m) => m.user_id === uid),
                              )
                              .filter((m): m is FamilyMemberInfo => !!m)
                              .map((m) => (
                                <div
                                  key={m.user_id}
                                  className="-ms-1 first:ms-0 ring-1 ring-edge-secondary rounded-full"
                                  title={`${m.username}@${m.email_domain}`}
                                >
                                  <ProfileAvatar
                                    email={`${m.username}@${m.email_domain}`}
                                    name={m.username}
                                    size="xs"
                                  />
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-txt-muted mt-0.5">
                        {t("settings.fam_org_domains_owned_by", {
                          name: d.owner_username,
                        })}
                      </p>
                    </div>
                  </div>
                  <button
                    className="text-sm text-accent-blue hover:underline flex-shrink-0 font-medium"
                    onClick={() => {
                      if (!d.dkim_verified) {
                        show_toast(
                          t("settings.fam_org_domains_share_disabled_title"),
                          "error",
                        );

                        return;
                      }
                      set_sharing(d.domain_name);
                      set_share_uid("");
                    }}
                  >
                    {t("settings.fam_org_domains_share")}
                  </button>
                </div>
                {sharing === d.domain_name && (
                  <div className="mt-3 ms-10 space-y-2">
                    <div className="flex gap-2">
                      <Select
                        value={share_uid || "_none"}
                        onValueChange={(v) =>
                          set_share_uid(v === "_none" ? "" : v)
                        }
                      >
                        <SelectTrigger className="flex-1 text-xs">
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
                      <button
                        className="aster_btn aster_btn_primary aster_btn_sm disabled:opacity-50"
                        disabled={!share_uid}
                        onClick={() => do_share(d.domain_name)}
                      >
                        {t("settings.fam_org_domains_add_btn")}
                      </button>
                      <button
                        className="aster_btn aster_btn_ghost aster_btn_sm"
                        onClick={() => set_sharing(null)}
                      >
                        {t("settings.fam_org_domains_done")}
                      </button>
                    </div>
                    {d.shared_with_user_ids.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-txt-muted uppercase tracking-wide">
                          {t("settings.fam_org_domains_shared_with")}
                        </p>
                        {d.shared_with_user_ids
                          .map((uid) => members.find((m) => m.user_id === uid))
                          .filter((m): m is FamilyMemberInfo => !!m)
                          .map((m) => (
                            <div
                              key={m.user_id}
                              className="flex items-center gap-2 py-0.5"
                            >
                              <ProfileAvatar
                                email={`${m.username}@${m.email_domain}`}
                                name={m.username}
                                size="xs"
                              />
                              <span className="text-xs text-txt-primary flex-1 truncate">
                                {m.username}@{m.email_domain}
                              </span>
                              <button
                                className="text-[10px] text-red-500 hover:underline flex-shrink-0"
                                onClick={() =>
                                  do_revoke(d.domain_name, m.user_id)
                                }
                              >
                                {t("settings.fam_org_domains_revoke")}
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
