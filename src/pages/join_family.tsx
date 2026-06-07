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
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { join_family, preview_invite, type InvitePreview } from "@/services/api/family";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { format_bytes } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/auth/auth_styles";

const page_wrap = "min-h-screen flex items-center justify-center p-4 bg-surf-secondary";

export default function JoinFamilyPage() {
  const [search_params] = useSearchParams();
  const navigate = useNavigate();
  const { is_authenticated, is_loading } = use_auth();
  const token = search_params.get("token") ?? "";

  const [preview, set_preview] = useState<InvitePreview | null>(null);
  const [preview_loading, set_preview_loading] = useState(true);
  const [joining, set_joining] = useState(false);
  const [error_msg, set_error_msg] = useState<string | null>(null);
  const [joined_bytes, set_joined_bytes] = useState<number | null>(null);

  useEffect(() => {
    if (!token) { set_preview_loading(false); set_error_msg("Invalid invite link."); return; }
    preview_invite(token)
      .then(r => { if (r.data?.valid) set_preview(r.data); else set_error_msg("This invite has expired or is no longer valid."); })
      .catch(() => set_error_msg("This invite has expired or is no longer valid."))
      .finally(() => set_preview_loading(false));
  }, [token]);

  const handle_join = async () => {
    if (!token || joining) return;
    set_joining(true);
    set_error_msg(null);
    try {
      const res = await join_family(token);
      if (!res.data) {
        set_error_msg(res.error || "We couldn't add you to this family. The invite may have expired or already been used.");
        return;
      }
      set_joined_bytes(res.data.allocated_storage_bytes);
      setTimeout(() => navigate("/", { replace: true }), 2500);
    } catch {
      set_error_msg("We couldn't add you to this family. The invite may have expired or already been used.");
    } finally {
      set_joining(false);
    }
  };

  // Do not auto-join: always require explicit button click to prevent CSRF-style forced joins.

  if (is_loading || preview_loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  }

  if (joined_bytes !== null) {
    return (
      <div className={page_wrap}>
        <div className="max-w-sm w-full text-center space-y-6 flex flex-col items-center">
          <CheckCircleIcon className="w-16 h-16 text-green-500" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-txt-primary">You're in!</h1>
            <p className="text-txt-muted">You've joined the family plan with {format_bytes(joined_bytes)} of storage.</p>
            <p className="text-sm text-txt-muted">Redirecting to your inbox...</p>
          </div>
          <div className="flex justify-center">
            <Spinner size="sm" />
          </div>
        </div>
      </div>
    );
  }

  if (error_msg && !preview) {
    return (
      <div className={page_wrap}>
        <div className="max-w-sm w-full text-center space-y-6 flex flex-col items-center">
          <Logo />
          <ExclamationTriangleIcon className="w-12 h-12 text-red-500" />
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-txt-primary">Invalid invite</h1>
            <p className="text-txt-muted text-sm">{error_msg}</p>
          </div>
          <Link to="/sign-in" className="aster_btn aster_btn_primary aster_btn_lg w-full text-center block">
            Sign in to Aster
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={page_wrap}>
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center space-y-3 flex flex-col items-center">
          <Logo />
          <UserGroupIcon className="w-12 h-12 text-accent-blue" />
          <div>
            <h1 className="text-2xl font-bold text-txt-primary">Join family plan</h1>
            {preview?.plan_name && (
              <p className="text-txt-muted text-sm mt-1">
                {preview.plan_name}
                {preview.allocated_storage_bytes
                  ? ` · ${format_bytes(preview.allocated_storage_bytes)} storage`
                  : " · shared storage"}
              </p>
            )}
            <p className="text-txt-muted text-sm mt-3 max-w-xs mx-auto leading-relaxed">
              Your own private, encrypted inbox - separate from everyone else on the plan.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-edge-secondary p-5 space-y-3 bg-surf-primary">
          <p className="text-xs font-semibold text-txt-muted uppercase tracking-wide">What you get</p>
          {[
            "Your own private, encrypted inbox",
            "Separate from other family members",
            "End-to-end encrypted email",
            "No ads, no tracking",
          ].map(item => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-sm text-txt-primary">{item}</span>
            </div>
          ))}
        </div>

        {preview?.require_2fa && (
          <div className="rounded-2xl p-4 space-y-2" style={{ background: "#f59e0b", border: "none" }}>
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-white flex-shrink-0" />
              <p className="text-sm font-semibold text-white">Security requirement</p>
            </div>
            <p className="text-xs text-white">
              This family requires two-factor authentication. You'll need to enable 2FA after joining.
            </p>
          </div>
        )}

        {error_msg && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "#ef4444", backgroundImage: "none", border: "none" }}>
            <ExclamationTriangleIcon className="w-4 h-4 text-white flex-shrink-0" />
            <p className="text-sm font-medium text-white">{error_msg}</p>
          </div>
        )}

        {is_authenticated ? (
          <button
            onClick={handle_join}
            disabled={joining}
            className="aster_btn aster_btn_primary aster_btn_lg w-full flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {joining ? <><Spinner size="sm" /> Joining...</> : "Accept & Join"}
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
          By joining you agree to our{" "}
          <a href="https://astermail.org/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms of Service</a>
          {" "}and{" "}
          <a href="https://astermail.org/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
