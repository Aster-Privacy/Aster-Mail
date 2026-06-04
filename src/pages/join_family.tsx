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
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { UserGroupIcon } from "@heroicons/react/24/outline";

import { join_family } from "@/services/api/family";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";

export default function JoinFamilyPage() {
  const { t } = use_i18n();
  const [search_params] = useSearchParams();
  const navigate = useNavigate();
  const { is_authenticated, is_loading } = use_auth();
  const token = search_params.get("token") ?? "";

  const [joining, set_joining] = useState(false);
  const [error, set_error] = useState(false);
  const [joined_bytes, set_joined_bytes] = useState<number | null>(null);

  useEffect(() => {
    if (!token) {
      set_error(true);
    }
  }, [token]);

  const handle_join = async () => {
    if (!token) return;
    set_joining(true);
    set_error(false);
    try {
      const res = await join_family(token);
      if (!res.data) throw new Error();
      set_joined_bytes(res.data.allocated_storage_bytes);
      setTimeout(() => navigate("/", { replace: true }), 2000);
    } catch {
      set_error(true);
    } finally {
      set_joining(false);
    }
  };

  useEffect(() => {
    if (!is_loading && is_authenticated && token && !joining && !error && joined_bytes === null) {
      handle_join();
    }
  }, [is_loading, is_authenticated, token]);

  if (is_loading) return null;

  if (joined_bytes !== null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto">
            <UserGroupIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {t("settings.family_plan_title")}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            {format_bytes(joined_bytes)} {t("settings.family_invite_storage").toLowerCase()}
          </p>
        </div>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <p className="text-red-600 dark:text-red-400">
            {t("settings.family_join_invalid")}
          </p>
          <Link to="/sign-in" className="aster_btn aster_btn_primary aster_btn_md inline-block">
            {t("settings.family_join_login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mx-auto">
            <UserGroupIcon className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {t("settings.family_join_title")}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            {t("settings.family_join_body")}
          </p>
        </div>

        {is_authenticated ? (
          <button
            onClick={handle_join}
            disabled={joining}
            className="aster_btn aster_btn_primary aster_btn_lg w-full disabled:opacity-50"
          >
            {joining ? "..." : t("settings.family_join_login")}
          </button>
        ) : (
          <div className="space-y-3">
            <Link
              to={`/register?next=${encodeURIComponent(`/join/family?token=${token}`)}`}
              className="aster_btn aster_btn_primary aster_btn_lg w-full text-center block"
            >
              {t("settings.family_join_create_account")}
            </Link>
            <Link
              to={`/sign-in?next=${encodeURIComponent(`/join/family?token=${token}`)}`}
              className="aster_btn aster_btn_secondary aster_btn_lg w-full text-center block"
            >
              {t("settings.family_join_login")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
