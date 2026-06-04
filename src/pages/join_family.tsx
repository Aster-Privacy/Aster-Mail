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
import {
  UserGroupIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { join_family } from "@/services/api/family";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/auth/auth_styles";

export default function JoinFamilyPage() {
  use_i18n();
  const [search_params] = useSearchParams();
  const navigate = useNavigate();
  const { is_authenticated, is_loading } = use_auth();
  const token = search_params.get("token") ?? "";

  const [joining, set_joining] = useState(false);
  const [error_msg, set_error_msg] = useState<string | null>(null);
  const [joined_bytes, set_joined_bytes] = useState<number | null>(null);

  useEffect(() => {
    if (!token) set_error_msg("Invalid invite link.");
  }, [token]);

  const handle_join = async () => {
    if (!token || joining) return;
    set_joining(true);
    set_error_msg(null);
    try {
      const res = await join_family(token);
      if (!res.data) throw new Error("Join failed");
      set_joined_bytes(res.data.allocated_storage_bytes);
      setTimeout(() => navigate("/", { replace: true }), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to join. The invite may have expired.";
      set_error_msg(msg);
    } finally {
      set_joining(false);
    }
  };

  // Auto-join if already authenticated when page loads
  useEffect(() => {
    if (!is_loading && is_authenticated && token && !joining && !error_msg && joined_bytes === null) {
      handle_join();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is_loading, is_authenticated, token]);

  if (is_loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Success state
  if (joined_bytes !== null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--bg-secondary)" }}>
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
            <CheckCircleIcon className="w-9 h-9 text-green-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-txt-primary">You're in!</h1>
            <p className="text-txt-muted">
              You've joined the family plan with {format_bytes(joined_bytes)} of storage.
            </p>
            <p className="text-sm text-txt-muted">Redirecting to your inbox...</p>
          </div>
          <Spinner size="sm" />
        </div>
      </div>
    );
  }

  // Error state (invalid token, no token)
  if ((error_msg && !joining) || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--bg-secondary)" }}>
        <div className="max-w-sm w-full text-center space-y-6">
          <Logo />
          <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mx-auto">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-txt-primary">Invalid invite</h1>
            <p className="text-txt-muted text-sm">{error_msg ?? "This invite link is invalid or has expired."}</p>
          </div>
          <div className="space-y-3">
            <Link
              to="/sign-in"
              className="aster_btn aster_btn_primary aster_btn_lg w-full text-center block"
            >
              Sign in to Aster
            </Link>
            <p className="text-xs text-txt-muted">Ask the family owner to send a new invite.</p>
          </div>
        </div>
      </div>
    );
  }

  // Main join page - authenticated user can join, unauthenticated needs to sign up first
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--bg-secondary)" }}>
      <div className="max-w-sm w-full space-y-8">
        <div className="text-center space-y-4">
          <Logo />
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: "var(--accent-blue-subtle)" }}>
            <UserGroupIcon className="w-9 h-9" style={{ color: "var(--accent-blue)" }} />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-txt-primary">Join family plan</h1>
            <p className="text-txt-muted text-sm">
              You've been invited to join an Aster family plan. Each member gets their own private, encrypted inbox.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-edge-secondary p-5 space-y-3" style={{ backgroundColor: "var(--bg-primary)" }}>
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-sm text-txt-primary">Separate private inbox</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-sm text-txt-primary">End-to-end encrypted email</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-sm text-txt-primary">Shared family storage pool</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-sm text-txt-primary">No ads, no tracking</span>
          </div>
        </div>

        {error_msg && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{error_msg}</p>
          </div>
        )}

        {is_authenticated ? (
          <button
            onClick={handle_join}
            disabled={joining}
            className="aster_btn aster_btn_primary aster_btn_lg w-full flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {joining ? <><Spinner size="sm" /> Joining...</> : "Accept Invite"}
          </button>
        ) : (
          <div className="space-y-3">
            <Link
              to={`/register?next=${encodeURIComponent(`/join/family?token=${token}`)}`}
              className="aster_btn aster_btn_primary aster_btn_lg w-full text-center block"
            >
              Create account & join
            </Link>
            <Link
              to={`/sign-in?next=${encodeURIComponent(`/join/family?token=${token}`)}`}
              className="aster_btn aster_btn_secondary aster_btn_lg w-full text-center block"
            >
              Sign in & join
            </Link>
          </div>
        )}

        <p className="text-center text-xs text-txt-muted">
          By joining you agree to{" "}
          <a href="https://astermail.org/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms of Service</a>
        </p>
      </div>
    </div>
  );
}
