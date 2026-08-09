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
import { Capacitor } from "@capacitor/core";

import { en } from "@/lib/i18n/translations/en";
import {
  get_csrf_token_from_cookie,
  set_csrf_token,
  clear_csrf_cache,
  is_state_changing_method,
} from "../csrf";
import { request_cache } from "../request_cache";
import {
  is_app_network_locked,
  is_endpoint_allowed_while_locked,
} from "../../app_lock_network_gate";

import { refresh_session_activity } from "@/services/session_timeout_service";
import { extend_passphrase_timeout } from "@/services/crypto/memory_key_store";
import { get_device_id } from "@/services/device_id";
import {
  routed_fetch,
  get_effective_base_url,
  get_effective_timeout,
  get_effective_retry_count,
  get_effective_retry_delay,
} from "@/services/routing/routing_provider";
import { ACCOUNTS_ROSTER_KEY, API_BASE_URL, ApiErrorCode, ApiResponse, CLIENT_PLATFORM_HEADER, CachedUserInfo, DEFAULT_RETRY_COUNT, DEFAULT_RETRY_DELAY, DEFAULT_TIMEOUT, DEV_TOKEN_KEY, FOLDER_UNLOCK_HEADER, IDENTITY_CHECK_MIN_INTERVAL_MS, NATIVE_CSRF_KEY, NATIVE_REFRESH_TOKEN_KEY, NATIVE_TOKEN_KEY, PROACTIVE_REFRESH_THRESHOLD_MINUTES, PendingTokenWrite, REFRESH_INTERVAL_MINUTES, RequestConfig, SessionReestablishResult, TAURI_CSRF_KEY, TAURI_TOKEN_KEY, clear_last_auth_ms, get_error_code_from_status, is_identity_establishing_endpoint, is_local_hostname, is_offline_tombstoned, is_tauri_env, is_write_dead_streak, unlock_token_cache_suffix, write_last_auth_ms } from "./helpers";

export class ApiClient {
  private refresh_timeout: number | null = null;
  private is_authenticated_flag: boolean = false;
  private auth_check_promise: Promise<boolean> | null = null;
  private dev_access_token: string | null = null;
  private active_refresh_token: string | null = null;
  private suspend_account_persist_flag: boolean = false;
  private initial_auth_verified: boolean = false;
  private refresh_promise: Promise<void> | null = null;
  private _cached_user_info: CachedUserInfo | null = null;
  private last_refresh_timestamp: number = 0;
  private refresh_denied_streak: number = 0;
  private refresh_denied_streak_started_at: number = 0;
  private session_expired_dispatched: boolean = false;
  private intentional_logout: boolean = false;
  private has_ever_authenticated: boolean = false;
  private account_add_in_progress: boolean = false;
  private expected_user_id: string | null = null;
  private identity_mismatch_dispatched: boolean = false;
  private last_identity_check_timestamp: number = 0;
  private pending_account_token_writes: Map<string, PendingTokenWrite> =
    new Map();

  constructor() {
    this.load_stored_tokens();
    this.setup_visibility_refresh();
  }

  private setup_visibility_refresh(): void {
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        this.is_authenticated_flag
      ) {
        this.verify_identity();

        const minutes_since_refresh =
          (Date.now() - this.last_refresh_timestamp) / 60_000;

        if (minutes_since_refresh >= REFRESH_INTERVAL_MINUTES / 2) {
          this.refresh_session();
        }
      }
    });
  }

  set_expected_user_id(user_id: string | null): void {
    if (user_id && this.expected_user_id !== user_id) {
      this.identity_mismatch_dispatched = false;
    }
    this.expected_user_id = user_id;
  }

  get_expected_user_id(): string | null {
    return this.expected_user_id;
  }

  private is_identity_mismatch(actual_user_id: string | undefined): boolean {
    if (!this.expected_user_id) return false;
    if (!actual_user_id) return false;
    if (this.account_add_in_progress) return false;
    if (this.intentional_logout) return false;

    return actual_user_id !== this.expected_user_id;
  }

  private dispatch_identity_mismatch(actual_user_id: string): void {
    this.is_authenticated_flag = false;
    request_cache.clear();
    this._cached_user_info = null;
    if (this.refresh_timeout) {
      clearTimeout(this.refresh_timeout);
      this.refresh_timeout = null;
    }
    if (this.identity_mismatch_dispatched) return;
    this.identity_mismatch_dispatched = true;
    try {
      window.dispatchEvent(
        new CustomEvent("astermail:identity-mismatch", {
          detail: {
            expected_user_id: this.expected_user_id,
            actual_user_id,
          },
        }),
      );
    } catch {
      /* ignore */
    }
  }

  async verify_identity(force: boolean = false): Promise<boolean> {
    if (!this.expected_user_id) return true;
    if (!this.is_authenticated_flag) return true;
    if (this.account_add_in_progress || this.intentional_logout) return true;
    if (!navigator.onLine) return true;

    const elapsed = Date.now() - this.last_identity_check_timestamp;

    if (!force && elapsed < IDENTITY_CHECK_MIN_INTERVAL_MS) {
      return true;
    }

    this.last_identity_check_timestamp = Date.now();

    return this.check_auth_status();
  }

  private load_stored_tokens(): void {
    if (is_tauri_env()) {
      try {
        const token = localStorage.getItem(TAURI_TOKEN_KEY);
        const csrf = localStorage.getItem(TAURI_CSRF_KEY);

        if (token) this.dev_access_token = token;
        if (csrf) set_csrf_token(csrf);
      } catch {}

      return;
    }
    if (!import.meta.env.DEV) return;
    if (!is_local_hostname()) return;
    const stored_token = sessionStorage.getItem(DEV_TOKEN_KEY);

    if (stored_token) {
      this.dev_access_token = stored_token;
    }
  }

  private async persist_native_token(token: string): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      await Preferences.set({ key: NATIVE_TOKEN_KEY, value: token });
    } catch {}
  }

  private async clear_native_token(): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      await Preferences.remove({ key: NATIVE_TOKEN_KEY });
    } catch {}
  }

  private async persist_native_refresh_token(token: string): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      await Preferences.set({ key: NATIVE_REFRESH_TOKEN_KEY, value: token });
    } catch {}
  }

  private async load_native_refresh_token(): Promise<string | null> {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const result = await Preferences.get({ key: NATIVE_REFRESH_TOKEN_KEY });

      return result.value;
    } catch {
      return null;
    }
  }

  private async clear_native_refresh_token(): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      await Preferences.remove({ key: NATIVE_REFRESH_TOKEN_KEY });
    } catch {}
  }

  private async load_native_token(): Promise<string | null> {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const result = await Preferences.get({ key: NATIVE_TOKEN_KEY });

      return result.value;
    } catch {
      return null;
    }
  }

  private async persist_native_csrf(token: string): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      await Preferences.set({ key: NATIVE_CSRF_KEY, value: token });
    } catch {}
  }

  private async load_native_csrf(): Promise<string | null> {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const result = await Preferences.get({ key: NATIVE_CSRF_KEY });

      return result.value;
    } catch {
      return null;
    }
  }

  private async clear_native_csrf(): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences");

      await Preferences.remove({ key: NATIVE_CSRF_KEY });
    } catch {}
  }

  private async recover_session_from_refresh_cookie(): Promise<boolean> {
    if (Capacitor.isNativePlatform() || is_tauri_env()) {
      return false;
    }

    try {
      if (localStorage.getItem(ACCOUNTS_ROSTER_KEY) === null) {
        return false;
      }
    } catch {
      return false;
    }

    try {
      const body: { expected_user_id?: string } = {};

      if (this.expected_user_id) {
        body.expected_user_id = this.expected_user_id;
      }

      const response = await this.post<{
        csrf_token: string;
        access_token?: string;
        refresh_token?: string;
      }>("/core/v1/auth/refresh", body, { skip_session_refresh: true });

      if (!response.data?.csrf_token) {
        return false;
      }

      clear_csrf_cache();
      this.set_csrf(response.data.csrf_token);
      this.last_refresh_timestamp = Date.now();

      if (response.data.access_token) {
        this.set_dev_token(
          response.data.access_token,
          response.data.refresh_token,
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  async verify_initial_auth(): Promise<boolean> {
    if (this.initial_auth_verified) {
      return this.is_authenticated_flag;
    }

    if (Capacitor.isNativePlatform() && !this.dev_access_token) {
      const persisted = await this.load_native_token();

      if (persisted) {
        this.dev_access_token = persisted;
      }
      const persisted_csrf = await this.load_native_csrf();

      if (persisted_csrf) {
        set_csrf_token(persisted_csrf);
      }
    }

    const csrf_token = get_csrf_token_from_cookie();
    const has_stored_token = !!this.dev_access_token;

    if (!csrf_token && !has_stored_token) {
      const recovered = await this.recover_session_from_refresh_cookie();

      if (!recovered) {
        this.initial_auth_verified = true;

        return false;
      }
    }

    this.is_authenticated_flag = true;

    if (!navigator.onLine) {
      if (is_offline_tombstoned()) {
        this.is_authenticated_flag = false;
        this.initial_auth_verified = true;
        this._cached_user_info = null;
        request_cache.clear();
        this.dispatch_session_expired(true);

        return false;
      }
      this.initial_auth_verified = true;
      this.schedule_token_refresh();

      return true;
    }

    this.initial_auth_verified = true;

    let is_valid = await this.check_auth_status();

    if (!is_valid) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      is_valid = await this.check_auth_status();
    }

    if (is_valid) {
      this.schedule_token_refresh();
    } else {
      this.is_authenticated_flag = false;
      clear_csrf_cache();
      this.clear_dev_token();
      if (!Capacitor.isNativePlatform() && !is_tauri_env()) {
        try {
          await this.clear_session_cookies();
        } catch {}
      }
    }

    return is_valid;
  }

  set_dev_token(
    token: string,
    refresh_token?: string,
    owner_account_id?: string | null,
  ): void {
    this.dev_access_token = token;
    if (refresh_token) {
      this.active_refresh_token = refresh_token;
    }
    if (import.meta.env.DEV) {
      sessionStorage.setItem(DEV_TOKEN_KEY, token);
    }
    if (Capacitor.isNativePlatform()) {
      this.persist_native_token(token);
      if (refresh_token) {
        this.persist_native_refresh_token(refresh_token);
      }
    }
    if (is_tauri_env()) {
      try {
        localStorage.setItem(TAURI_TOKEN_KEY, token);
      } catch {}
    }
    this.persist_to_active_account(token, refresh_token, owner_account_id);
  }

  suspend_account_persist(): void {
    this.suspend_account_persist_flag = true;
  }

  resume_account_persist(): void {
    this.suspend_account_persist_flag = false;
    void this.flush_pending_account_token_writes();
  }

  private token_owner_account_id(): string | null {
    if (this.account_add_in_progress) return null;

    return this.expected_user_id;
  }

  private queue_account_token_write(
    account_id: string,
    access_token: string | null,
    refresh_token?: string | null,
  ): void {
    const existing = this.pending_account_token_writes.get(account_id);

    this.pending_account_token_writes.set(account_id, {
      access_token,
      refresh_token:
        refresh_token === undefined ? existing?.refresh_token : refresh_token,
    });
  }

  private async write_account_tokens(
    account_id: string,
    access_token: string | null,
    refresh_token?: string | null,
  ): Promise<void> {
    try {
      const { update_account_tokens } = await import(
        "@/services/account_manager"
      );

      if (this.intentional_logout) return;

      await update_account_tokens(account_id, access_token, refresh_token);
    } catch {}
  }

  private async flush_pending_account_token_writes(): Promise<void> {
    if (this.suspend_account_persist_flag) return;
    if (this.intentional_logout) {
      this.pending_account_token_writes.clear();

      return;
    }
    if (this.pending_account_token_writes.size === 0) return;

    const entries = Array.from(this.pending_account_token_writes.entries());

    this.pending_account_token_writes.clear();

    for (const [account_id, write] of entries) {
      await this.write_account_tokens(
        account_id,
        write.access_token,
        write.refresh_token,
      );
    }
  }

  private persist_to_active_account(
    access_token: string | null,
    refresh_token?: string | null,
    owner_account_id?: string | null,
  ): void {
    if (this.intentional_logout) return;
    if (owner_account_id === null) return;

    const owner_id = owner_account_id ?? this.token_owner_account_id();

    if (this.suspend_account_persist_flag) {
      if (owner_id) {
        this.queue_account_token_write(owner_id, access_token, refresh_token);
      }

      return;
    }

    if (owner_id) {
      void this.write_account_tokens(owner_id, access_token, refresh_token);

      return;
    }

    import("@/services/account_manager")
      .then(async ({ get_current_account_id, update_account_tokens }) => {
        if (this.intentional_logout) return;
        const id = await get_current_account_id();
        if (!id) return;
        if (this.intentional_logout) return;
        await update_account_tokens(id, access_token, refresh_token);
      })
      .catch(() => {});
  }

  async load_tokens_for_account(account_id: string): Promise<boolean> {
    try {
      const { get_account_tokens } = await import(
        "@/services/account_manager"
      );
      const tokens = await get_account_tokens(account_id);

      this.active_refresh_token = tokens.refresh_token;

      if (tokens.access_token) {
        this.dev_access_token = tokens.access_token;
        if (Capacitor.isNativePlatform()) {
          await this.persist_native_token(tokens.access_token);
          if (tokens.refresh_token) {
            await this.persist_native_refresh_token(tokens.refresh_token);
          }
        }
        if (is_tauri_env()) {
          try {
            localStorage.setItem(TAURI_TOKEN_KEY, tokens.access_token);
          } catch {}
        }
        if (import.meta.env.DEV) {
          sessionStorage.setItem(DEV_TOKEN_KEY, tokens.access_token);
        }

        return true;
      }

      if (tokens.refresh_token) {
        return true;
      }
    } catch {}

    return false;
  }

  clear_in_memory_token(): void {
    this.dev_access_token = null;
    this.active_refresh_token = null;
    if (import.meta.env.DEV) {
      sessionStorage.removeItem(DEV_TOKEN_KEY);
    }
  }

  set_csrf(token: string): void {
    set_csrf_token(token);
    if (Capacitor.isNativePlatform()) {
      this.persist_native_csrf(token);
    }
    if (is_tauri_env()) {
      try {
        localStorage.setItem(TAURI_CSRF_KEY, token);
      } catch {}
    }
  }

  clear_dev_token(): void {
    this.dev_access_token = null;
    this.active_refresh_token = null;
    this.refresh_denied_streak = 0;
    this.refresh_denied_streak_started_at = 0;
    if (import.meta.env.DEV) {
      sessionStorage.removeItem(DEV_TOKEN_KEY);
    }
    if (Capacitor.isNativePlatform()) {
      this.clear_native_token();
      this.clear_native_csrf();
      this.clear_native_refresh_token();
    }
    if (is_tauri_env()) {
      try {
        localStorage.removeItem(TAURI_TOKEN_KEY);
        localStorage.removeItem(TAURI_CSRF_KEY);
      } catch {}
    }
  }

  private schedule_token_refresh(): void {
    if (this.refresh_timeout) {
      clearTimeout(this.refresh_timeout);
    }

    if (!this.last_refresh_timestamp) {
      this.last_refresh_timestamp = Date.now();
    }

    const refresh_interval = REFRESH_INTERVAL_MINUTES * 60 * 1000;

    this.refresh_timeout = window.setTimeout(() => {
      this.refresh_session();
    }, refresh_interval);
  }

  async refresh_session(): Promise<void> {
    if (!this.is_authenticated_flag) return;
    if (!this.initial_auth_verified) return;

    if (!navigator.onLine) {
      this.schedule_token_refresh();

      return;
    }

    if (this.refresh_promise) {
      return this.refresh_promise;
    }

    if (
      this.last_refresh_timestamp &&
      Date.now() - this.last_refresh_timestamp < 5000
    ) {
      return;
    }

    this.refresh_promise = this.refresh_session_impl().finally(() => {
      this.refresh_promise = null;
    });

    return this.refresh_promise;
  }

  private is_transient_error_code(code: ApiErrorCode | undefined): boolean {
    return (
      code === "NETWORK_ERROR" ||
      code === "TIMEOUT_ERROR" ||
      code === "SERVER_ERROR" ||
      code === "UNKNOWN_ERROR"
    );
  }

  private async refresh_session_impl(): Promise<void> {
    const max_retries = 3;
    const retry_delay_base = 2000;

    const owner_account_id: string | null | undefined = this
      .account_add_in_progress
      ? null
      : (this.expected_user_id ?? undefined);

    let stored_refresh_token: string | null = this.active_refresh_token;
    if (Capacitor.isNativePlatform()) {
      stored_refresh_token =
        (await this.load_native_refresh_token()) ?? stored_refresh_token;
    }

    for (let attempt = 0; attempt < max_retries; attempt++) {
      try {
        const scoped_user_id = owner_account_id ?? null;
        const body: {
          refresh_token?: string;
          expected_user_id?: string;
        } = {};

        if (stored_refresh_token) body.refresh_token = stored_refresh_token;
        if (scoped_user_id) body.expected_user_id = scoped_user_id;
        const response = await this.post<{
          csrf_token: string;
          access_token?: string;
          refresh_token?: string;
        }>("/core/v1/auth/refresh", body);

        if (this.intentional_logout) {
          return;
        }

        if (response.data?.csrf_token) {
          this.is_authenticated_flag = true;
          this.last_refresh_timestamp = Date.now();
          this.refresh_denied_streak = 0;
          this.refresh_denied_streak_started_at = 0;
          clear_csrf_cache();
          this.set_csrf(response.data.csrf_token);
          if (response.data.access_token) {
            this.set_dev_token(
              response.data.access_token,
              response.data.refresh_token,
              owner_account_id,
            );
          } else if (response.data.refresh_token) {
            this.active_refresh_token = response.data.refresh_token;
            if (Capacitor.isNativePlatform()) {
              this.persist_native_refresh_token(response.data.refresh_token);
            }
            this.persist_to_active_account(
              this.dev_access_token,
              response.data.refresh_token,
              owner_account_id,
            );
          }
          this.schedule_token_refresh();
          this.verify_identity(true);

          return;
        }

        if (this.is_transient_error_code(response.code)) {
          if (attempt < max_retries - 1) {
            await this.delay(retry_delay_base * (attempt + 1));
            continue;
          }
          this.schedule_token_refresh();

          return;
        }

        if (response.code === "UNAUTHORIZED" || response.code === "FORBIDDEN") {
          let me_response: ApiResponse<{ user_id: string }> | null = null;

          try {
            me_response = await this.get<{ user_id: string }>(
              "/core/v1/auth/me",
              { skip_cache: true, skip_session_refresh: true, skip_dedup: true },
            );
          } catch (e) {
            if (import.meta.env.DEV) console.error(e);
            if (attempt < max_retries - 1) {
              await this.delay(retry_delay_base * (attempt + 1));
              continue;
            }
            this.schedule_token_refresh();

            return;
          }

          if (me_response.data?.user_id) {
            if (this.is_identity_mismatch(me_response.data.user_id)) {
              this.dispatch_identity_mismatch(me_response.data.user_id);

              return;
            }
            this.refresh_denied_streak += 1;
            if (!this.refresh_denied_streak_started_at) {
              this.refresh_denied_streak_started_at = Date.now();
            }
            if (
              is_write_dead_streak(
                this.refresh_denied_streak,
                this.refresh_denied_streak_started_at,
                Date.now(),
              )
            ) {
              this.is_authenticated_flag = false;
              this.dispatch_session_expired();

              return;
            }
            this.schedule_token_refresh();

            return;
          }

          if (this.is_transient_error_code(me_response.code)) {
            if (attempt < max_retries - 1) {
              await this.delay(retry_delay_base * (attempt + 1));
              continue;
            }
            this.schedule_token_refresh();

            return;
          }

          if (
            me_response.code === "UNAUTHORIZED" ||
            me_response.code === "FORBIDDEN"
          ) {
            this.is_authenticated_flag = false;
            this.dispatch_session_expired();

            return;
          }

          this.schedule_token_refresh();

          return;
        }

        this.schedule_token_refresh();

        return;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error(
            `Session refresh attempt ${attempt + 1}/${max_retries} failed:`,
            error,
          );
        }
        if (attempt < max_retries - 1) {
          await this.delay(retry_delay_base * (attempt + 1));
          continue;
        }
        this.schedule_token_refresh();
      }
    }
  }

  private dispatch_session_expired(force: boolean = false): void {
    if (this.intentional_logout) return;
    if (this.account_add_in_progress) return;
    if (this.session_expired_dispatched) return;
    if (!force && !this.has_ever_authenticated) return;
    this.session_expired_dispatched = true;
    window.dispatchEvent(new Event("astermail:session-expired"));
  }

  begin_account_add(): void {
    this.account_add_in_progress = true;
  }

  end_account_add(): void {
    this.account_add_in_progress = false;
  }

  begin_intentional_logout(): void {
    this.intentional_logout = true;
    this.suspend_account_persist_flag = true;
    this.pending_account_token_writes.clear();
    this.session_expired_dispatched = true;
    if (this.refresh_timeout) {
      clearTimeout(this.refresh_timeout);
      this.refresh_timeout = null;
    }
  }

  private clear_auth_state(): void {
    this.is_authenticated_flag = false;
    this.initial_auth_verified = false;
    this.expected_user_id = null;
    this.identity_mismatch_dispatched = false;
    this.last_identity_check_timestamp = 0;
    this.clear_dev_token();
    clear_csrf_cache();
    request_cache.clear();
    clear_last_auth_ms();
    if (this.refresh_timeout) {
      clearTimeout(this.refresh_timeout);
      this.refresh_timeout = null;
    }
  }

  set_authenticated(authenticated: boolean): void {
    this.is_authenticated_flag = authenticated;
    if (authenticated) {
      this.has_ever_authenticated = true;
      this.intentional_logout = false;
      this.suspend_account_persist_flag = false;
      this.session_expired_dispatched = false;
      this.initial_auth_verified = true;
      void this.flush_pending_account_token_writes();
      if (!this.last_refresh_timestamp) {
        this.last_refresh_timestamp = Date.now();
      }
      write_last_auth_ms(Date.now());
      this.schedule_token_refresh();
      try {
        window.dispatchEvent(new Event("astermail:authenticated"));
      } catch {
        /* ignore */
      }
    } else {
      this.clear_auth_state();
    }
  }

  is_authenticated(): boolean {
    return this.is_authenticated_flag;
  }

  is_initial_auth_verified(): boolean {
    return this.initial_auth_verified;
  }

  set_initial_auth_verified(verified: boolean): void {
    this.initial_auth_verified = verified;
  }

  get_access_token(): string | null {
    return this.dev_access_token;
  }

  get_active_refresh_token(): string | null {
    return this.active_refresh_token;
  }

  private token_survives_reload(): boolean {
    return (
      is_tauri_env() ||
      Capacitor.isNativePlatform() ||
      (import.meta.env.DEV && is_local_hostname())
    );
  }

  can_persist_session(): boolean {
    return this.token_survives_reload();
  }

  async prepare_for_account_switch(): Promise<void> {
    if (this.refresh_timeout) {
      clearTimeout(this.refresh_timeout);
      this.refresh_timeout = null;
    }
    this.is_authenticated_flag = false;
    try {
      await this.refresh_promise;
    } catch {}
  }

  async reestablish_session_for_account(
    account_id: string,
  ): Promise<SessionReestablishResult> {
    const loaded = await this.load_tokens_for_account(account_id);

    if (!loaded) {
      return "expired";
    }

    if (!this.dev_access_token && !this.active_refresh_token) {
      return "expired";
    }

    const prior_suspend = this.suspend_account_persist_flag;

    this.suspend_account_persist_flag = true;

    const fail = (
      reason: Exclude<SessionReestablishResult, "ok">,
    ): Exclude<SessionReestablishResult, "ok"> => {
      this.is_authenticated_flag = false;
      this.clear_in_memory_token();

      return reason;
    };

    const clear_dead_tokens = async (): Promise<void> => {
      try {
        const { update_account_tokens } = await import(
          "@/services/account_manager"
        );

        await update_account_tokens(account_id, null, null);
      } catch {}
    };

    try {
      let cookies_reissued = false;
      let reissue_denied = false;

      const reissue_cookies_impl = async (): Promise<boolean> => {
        try {
          const refreshed = await this.post<{
            csrf_token: string;
            access_token?: string;
            refresh_token?: string;
          }>(
            "/core/v1/auth/refresh",
            this.active_refresh_token
              ? {
                  refresh_token: this.active_refresh_token,
                  expected_user_id: account_id,
                }
              : { expected_user_id: account_id },
            { skip_session_refresh: true },
          );

          if (!refreshed.data?.csrf_token) {
            if (
              refreshed.code === "UNAUTHORIZED" ||
              refreshed.code === "FORBIDDEN"
            ) {
              reissue_denied = true;
            }

            return false;
          }

          clear_csrf_cache();
          this.set_csrf(refreshed.data.csrf_token);
          if (refreshed.data.access_token) {
            this.set_dev_token(
              refreshed.data.access_token,
              refreshed.data.refresh_token,
              account_id,
            );
          } else if (refreshed.data.refresh_token) {
            this.active_refresh_token = refreshed.data.refresh_token;
          }

          return true;
        } catch (e) {
          if (import.meta.env.DEV) console.error(e);

          return false;
        }
      };

      const reissue_cookies = async (): Promise<boolean> => {
        if (this.refresh_promise) {
          try {
            await this.refresh_promise;
          } catch {}
        }

        const result = reissue_cookies_impl();
        const lock = result.then(
          () => {},
          () => {},
        );

        this.refresh_promise = lock;
        lock.finally(() => {
          if (this.refresh_promise === lock) {
            this.refresh_promise = null;
          }
        });

        return result;
      };

      if (!this.dev_access_token) {
        cookies_reissued = await reissue_cookies();

        if (!cookies_reissued) {
          if (reissue_denied) {
            await clear_dead_tokens();

            return fail("expired");
          }

          return fail("unavailable");
        }
      }

      this.is_authenticated_flag = true;
      this.initial_auth_verified = true;

      const verify_identity_call = () =>
        this.get<{ user_id: string }>("/core/v1/auth/me", {
          skip_cache: true,
          skip_session_refresh: true,
          skip_dedup: true,
        });

      let me_response = await verify_identity_call();

      const me_denied = (response: typeof me_response): boolean =>
        response.code === "UNAUTHORIZED" || response.code === "FORBIDDEN";

      if (!me_response.data?.user_id && me_denied(me_response)) {
        if (!cookies_reissued) {
          cookies_reissued = await reissue_cookies();

          if (cookies_reissued) {
            me_response = await verify_identity_call();
          }
        }
      }

      if (!me_response.data?.user_id) {
        const denied = me_denied(me_response);

        if (denied && reissue_denied) {
          await clear_dead_tokens();
        }

        return fail(denied ? "expired" : "unavailable");
      }

      if (me_response.data.user_id !== account_id) {
        try {
          await this.clear_session_cookies();
        } catch {}

        return fail("expired");
      }

      this.has_ever_authenticated = true;
      this.last_refresh_timestamp = Date.now();

      if (!cookies_reissued) {
        cookies_reissued = await reissue_cookies();
      }

      if (!cookies_reissued && !this.token_survives_reload()) {
        return fail(reissue_denied ? "expired" : "unavailable");
      }

      try {
        const { update_account_tokens } = await import(
          "@/services/account_manager"
        );

        await update_account_tokens(
          account_id,
          this.dev_access_token,
          this.active_refresh_token,
        );
      } catch {}

      this.schedule_token_refresh();

      return "ok";
    } finally {
      this.pending_account_token_writes.delete(account_id);
      this.suspend_account_persist_flag = prior_suspend;
      if (!prior_suspend) {
        void this.flush_pending_account_token_writes();
      }
    }
  }

  get_cached_user_info(): CachedUserInfo | null {
    return this._cached_user_info;
  }

  async check_auth_status(): Promise<boolean> {
    if (this.auth_check_promise) {
      return this.auth_check_promise;
    }

    this.auth_check_promise = (async () => {
      try {
        const response = await this.get<CachedUserInfo>("/core/v1/auth/me", {
          skip_cache: true,
          skip_dedup: true,
        });

        if (response.data?.user_id) {
          if (this.is_identity_mismatch(response.data.user_id)) {
            this.dispatch_identity_mismatch(response.data.user_id);

            return false;
          }
          this.is_authenticated_flag = true;
          this.has_ever_authenticated = true;
          this._cached_user_info = response.data;
          this.last_identity_check_timestamp = Date.now();

          return true;
        }

        if (response.code === "UNAUTHORIZED" || response.code === "FORBIDDEN") {
          this.is_authenticated_flag = false;

          return false;
        }

        return this.is_authenticated_flag;
      } catch {
        return this.is_authenticated_flag;
      } finally {
        this.auth_check_promise = null;
      }
    })();

    return this.auth_check_promise;
  }

  clear_auth_data(): void {
    this.clear_auth_state();
  }

  async clear_session_cookies(): Promise<boolean> {
    try {
      const response = await this.post("/core/v1/auth/clear-session", {});
      clear_csrf_cache();

      return !response.error;
    } catch {
      return false;
    }
  }

  private async request_with_timeout(
    url: string,
    options: RequestInit,
    timeout: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout_id = setTimeout(() => controller.abort(), timeout);
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => {
          const err = new Error("Request timed out");

          err.name = "AbortError";
          reject(err);
        },
        { once: true },
      );
    });

    try {
      return (await Promise.race([
        routed_fetch(url, {
          ...options,
          signal: controller.signal,
        }),
        aborted,
      ])) as Response;
    } finally {
      clearTimeout(timeout_id);
    }
  }

  private async ensure_fresh_token(
    endpoint: string,
    skip_session_refresh = false,
  ): Promise<void> {
    if (
      skip_session_refresh ||
      !this.is_authenticated_flag ||
      !this.initial_auth_verified ||
      !this.last_refresh_timestamp ||
      endpoint.includes("/auth/refresh") ||
      endpoint.includes("/auth/login") ||
      endpoint.includes("/auth/register") ||
      endpoint.includes("/auth/logout") ||
      endpoint.includes("/auth/totp/") ||
      endpoint.includes("/auth/salt")
    ) {
      return;
    }

    const minutes_since_refresh =
      (Date.now() - this.last_refresh_timestamp) / 60_000;

    if (minutes_since_refresh >= PROACTIVE_REFRESH_THRESHOLD_MINUTES) {
      try {
        await this.refresh_session();
      } catch {}
    }
  }

  private async ensure_csrf_token(
    endpoint: string,
    skip_session_refresh: boolean,
  ): Promise<string | null> {
    if (
      skip_session_refresh ||
      !this.is_authenticated_flag ||
      endpoint.includes("/auth/refresh") ||
      endpoint.includes("/auth/login") ||
      endpoint.includes("/auth/register") ||
      endpoint.includes("/auth/logout") ||
      endpoint.includes("/auth/clear-session")
    ) {
      return null;
    }

    try {
      await this.refresh_session();
    } catch {}

    return get_csrf_token_from_cookie();
  }

  private async request<T>(
    endpoint: string,
    config: RequestConfig = {},
  ): Promise<ApiResponse<T>> {
    if (is_app_network_locked() && !is_endpoint_allowed_while_locked(endpoint)) {
      return { error: "App is locked", code: "APP_LOCKED" };
    }

    if (is_identity_establishing_endpoint(endpoint)) {
      this.set_expected_user_id(null);
    }

    await this.ensure_fresh_token(endpoint, config.skip_session_refresh);

    const {
      timeout = get_effective_timeout(DEFAULT_TIMEOUT),
      retry = get_effective_retry_count(DEFAULT_RETRY_COUNT),
      retry_delay = get_effective_retry_delay(DEFAULT_RETRY_DELAY),
      cache_ttl: _cache_ttl,
      skip_cache: _skip_cache,
      skip_session_refresh = false,
      skip_upgrade_prompt = false,
      folder_unlock_token,
      ...options
    } = config;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Aster-Client": CLIENT_PLATFORM_HEADER,
      ...((options.headers as Record<string, string>) || {}),
    };

    const apply_folder_unlock_header = (): void => {
      if (folder_unlock_token) {
        headers[FOLDER_UNLOCK_HEADER] = folder_unlock_token;
      }
    };

    apply_folder_unlock_header();

    const device_id = get_device_id();

    if (device_id) {
      headers["X-Aster-Device-Id"] = device_id;
    }

    if (this.dev_access_token) {
      headers["Authorization"] = `Bearer ${this.dev_access_token}`;
    }

    const method = options.method || "GET";

    if (is_state_changing_method(method)) {
      if (
        this.refresh_promise &&
        !skip_session_refresh &&
        !endpoint.includes("/auth/refresh") &&
        !endpoint.includes("/auth/login") &&
        !endpoint.includes("/auth/register") &&
        !endpoint.includes("/auth/logout") &&
        !endpoint.includes("/auth/clear-session")
      ) {
        await this.refresh_promise.catch(() => undefined);
      }

      let csrf_token = get_csrf_token_from_cookie();

      if (!csrf_token) {
        csrf_token = await this.ensure_csrf_token(
          endpoint,
          skip_session_refresh,
        );
      }

      if (csrf_token) {
        headers["X-CSRF-Token"] = csrf_token;
      }
    }

    const url = `${get_effective_base_url(API_BASE_URL)}${endpoint}`;
    let last_error: ApiResponse<T> = {
      error: "Request failed",
      code: "UNKNOWN_ERROR",
    };
    let has_attempted_refresh = false;

    for (let attempt = 0; attempt <= retry; attempt++) {
      try {
        const response = await this.request_with_timeout(
          url,
          { ...options, headers, credentials: "include" },
          timeout,
        );

        if (!response.ok) {
          let error_data: {
            error?: string;
            code?: string;
            details?: Record<string, unknown>;
            resets_at?: string;
          } = {};

          try {
            error_data = await response.json();
          } catch {
            error_data = { error: response.statusText };
          }

          const error_code = get_error_code_from_status(response.status);

          if (
            response.status === 403 &&
            error_data.code === "CSRF_INVALID" &&
            is_state_changing_method(method) &&
            !skip_session_refresh &&
            !endpoint.includes("/auth/refresh") &&
            !endpoint.includes("/auth/logout") &&
            !endpoint.includes("/auth/clear-session")
          ) {
            if (!has_attempted_refresh) {
              has_attempted_refresh = true;
              clear_csrf_cache();
              try {
                await this.refresh_session();
              } catch (e) {
                if (import.meta.env.DEV) console.error(e);
              }
              if (this.is_authenticated_flag) {
                if (this.dev_access_token) {
                  headers["Authorization"] = `Bearer ${this.dev_access_token}`;
                }
                apply_folder_unlock_header();
                const fresh_csrf = get_csrf_token_from_cookie();

                if (fresh_csrf) {
                  headers["X-CSRF-Token"] = fresh_csrf;
                  attempt--;
                  continue;
                }
              }
            }
            this.dispatch_session_expired();
          }

          if (
            response.status === 403 &&
            error_data.code === "VERIFICATION_REQUIRED"
          ) {
            window.dispatchEvent(new Event("aster:verification-required"));

            return {
              error: "Recovery email verification required",
              code: "FORBIDDEN",
            };
          }

          if (
            response.status === 403 &&
            error_data.code === "ACCOUNT_SUSPENDED"
          ) {
            window.dispatchEvent(
              new CustomEvent("aster:account-suspended", {
                detail: { reason: error_data.error || "Account suspended" },
              }),
            );

            return {
              error: error_data.error || "Account suspended",
              code: "FORBIDDEN",
            };
          }

          if (
            response.status === 403 &&
            error_data.code === "ABUSE_ACCOUNT_LIMIT"
          ) {
            return {
              error: error_data.error || "Account limit reached",
              code: "ABUSE_ACCOUNT_LIMIT",
            };
          }

          if (
            response.status === 422 &&
            error_data.code === "RECOVERY_EMAIL_REQUIRED"
          ) {
            return {
              error: error_data.error || "Recovery email required",
              code: "RECOVERY_EMAIL_REQUIRED",
            };
          }

          if (
            response.status === 403 &&
            error_data.code === "PLAN_LIMIT_EXCEEDED"
          ) {
            if (!skip_upgrade_prompt) {
              window.dispatchEvent(
                new CustomEvent("aster:plan-limit-hit", {
                  detail: {
                    message: error_data.error || "Plan limit reached",
                    resource:
                      (error_data.details?.resource as string | undefined) ??
                      null,
                  },
                }),
              );
            }

            return {
              error: error_data.error || "Plan limit reached",
              code: "FORBIDDEN",
              server_code: "PLAN_LIMIT_EXCEEDED",
            };
          }

          if (
            response.status === 413 &&
            error_data.code === "STORAGE_QUOTA_EXCEEDED"
          ) {
            if (!skip_upgrade_prompt) {
              window.dispatchEvent(
                new CustomEvent("aster:storage-full", {
                  detail: {
                    message: error_data.error || "Storage full",
                  },
                }),
              );
            }

            return {
              error: error_data.error || "Storage quota exceeded",
              code: "UNKNOWN_ERROR",
              server_code: "STORAGE_QUOTA_EXCEEDED",
            };
          }

          if (
            response.status === 409 &&
            error_data.code === "ALREADY_SIGNED_IN_ON_DEVICE"
          ) {
            window.dispatchEvent(
              new CustomEvent("aster:already-signed-in", {
                detail: {
                  message: error_data.error || "Already signed in on this device",
                },
              }),
            );

            return {
              error:
                error_data.error || "Already signed in on this device",
              code: "CONFLICT",
              server_code: "ALREADY_SIGNED_IN_ON_DEVICE",
            };
          }

          if (
            response.status === 409 &&
            error_data.code === "USERNAME_IN_USE"
          ) {
            return {
              error: error_data.error || "This username is already taken",
              code: "USERNAME_IN_USE",
            };
          }

          if (
            response.status === 401 &&
            error_data.code !== "INVALID_CREDENTIALS" &&
            !endpoint.includes("/auth/switch") &&
            !endpoint.includes("/auth/clear-session")
          ) {
            if (
              !skip_session_refresh &&
              !has_attempted_refresh &&
              !endpoint.includes("/auth/refresh") &&
              !endpoint.includes("/auth/logout") &&
              !endpoint.includes("/auth/clear-session")
            ) {
              has_attempted_refresh = true;
              try {
                await this.refresh_session();
              } catch (e) {
                if (import.meta.env.DEV) console.error(e);
              }
              if (this.is_authenticated_flag) {
                if (this.dev_access_token) {
                  headers["Authorization"] = `Bearer ${this.dev_access_token}`;
                }
                apply_folder_unlock_header();
                const fresh_csrf = get_csrf_token_from_cookie();

                if (fresh_csrf && is_state_changing_method(method)) {
                  headers["X-CSRF-Token"] = fresh_csrf;
                }
                attempt--;
                continue;
              }
            }
            if (!this.is_authenticated_flag) {
              this.dispatch_session_expired();
            }
          }

          const sanitized_error = import.meta.env.DEV
            ? error_data.error ||
              `Request failed with status ${response.status}`
            : response.status < 500 && error_data.error
              ? error_data.error
              : this.get_generic_error_message(error_code);

          last_error = {
            error: sanitized_error,
            code: error_code,
            server_code: error_data.code,
            resets_at: error_data.resets_at,
          };

          if (
            response.status === 403 &&
            error_data.code !== "ACCOUNT_LOCKED" &&
            is_state_changing_method(method) &&
            attempt === 0 &&
            !skip_session_refresh &&
            !this.dev_access_token
          ) {
            clear_csrf_cache();
            try {
              await this.refresh_session();
              apply_folder_unlock_header();
              const fresh_csrf = get_csrf_token_from_cookie();

              if (fresh_csrf) {
                headers["X-CSRF-Token"] = fresh_csrf;
                continue;
              }
            } catch {}
          }

          if (
            response.status >= 500 &&
            attempt < retry &&
            !is_state_changing_method(method)
          ) {
            await this.delay(retry_delay * (attempt + 1));
            continue;
          }

          return last_error;
        }

        let data: T;

        if (
          response.status === 204 ||
          response.headers.get("content-length") === "0"
        ) {
          data = undefined as T;
        } else {
          const raw = await response.text().catch(() => null);
          if (raw === null) {
            last_error = {
              error: this.get_generic_error_message("NETWORK_ERROR"),
              code: "NETWORK_ERROR",
            };

            if (attempt < retry && !is_state_changing_method(method)) {
              await this.delay(retry_delay * (attempt + 1));
              continue;
            }

            return last_error;
          }
          if (raw.trim() === "") {
            data = undefined as T;
          } else {
            try {
              data = JSON.parse(raw) as T;
            } catch {
              last_error = {
                error: this.get_generic_error_message("SERVER_ERROR"),
                code: "SERVER_ERROR",
              };

              if (attempt < retry) {
                await this.delay(retry_delay * (attempt + 1));
                continue;
              }

              return last_error;
            }
          }
        }

        refresh_session_activity();
        extend_passphrase_timeout();
        write_last_auth_ms(Date.now());

        return { data };
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            last_error = {
              error: "Request timed out",
              code: "TIMEOUT_ERROR",
            };
          } else {
            last_error = {
              error: error.message || "Network error",
              code: "NETWORK_ERROR",
            };
          }
        }

        if (attempt < retry && !is_state_changing_method(method)) {
          await this.delay(retry_delay * (attempt + 1));
          continue;
        }
      }
    }

    return last_error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private get_generic_error_message(code: ApiErrorCode): string {
    switch (code) {
      case "UNAUTHORIZED":
        return en.errors.auth_required;
      case "FORBIDDEN":
        return en.errors.no_permission;
      case "NOT_FOUND":
        return en.errors.not_found;
      case "VALIDATION_ERROR":
        return en.errors.invalid_request;
      case "CONFLICT":
        return en.errors.conflict;
      case "RATE_LIMIT_EXCEEDED":
        return en.errors.rate_limited;
      case "SERVER_ERROR":
        return en.errors.internal_error;
      case "NETWORK_ERROR":
        return en.errors.connection_failed;
      case "TIMEOUT_ERROR":
        return en.errors.request_timeout;
      default:
        return en.errors.unexpected_error;
    }
  }

  async get<T>(
    endpoint: string,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    const { cache_ttl, skip_cache, skip_dedup, ...fetch_config } = config ?? {};
    const cache_key = `GET:${endpoint}${unlock_token_cache_suffix(
      fetch_config.folder_unlock_token,
    )}`;

    return request_cache.get_or_fetch<ApiResponse<T>>(
      cache_key,
      () => this.request<T>(endpoint, { ...fetch_config, method: "GET" }),
      cache_ttl,
      skip_cache,
      skip_dedup,
    );
  }

  async post<T>(
    endpoint: string,
    body: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    const result = await this.request<T>(endpoint, {
      ...config,
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!result.error) {
      request_cache.invalidate_for_mutation(endpoint);
    }

    return result;
  }

  async put<T>(
    endpoint: string,
    body: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    const result = await this.request<T>(endpoint, {
      ...config,
      method: "PUT",
      body: JSON.stringify(body),
    });

    if (!result.error) {
      request_cache.invalidate_for_mutation(endpoint);
    }

    return result;
  }

  async patch<T>(
    endpoint: string,
    body: unknown,
    config?: RequestConfig,
  ): Promise<ApiResponse<T>> {
    const result = await this.request<T>(endpoint, {
      ...config,
      method: "PATCH",
      body: JSON.stringify(body),
    });

    if (!result.error) {
      request_cache.invalidate_for_mutation(endpoint);
    }

    return result;
  }

  async delete<T>(
    endpoint: string,
    config?: RequestConfig & { data?: unknown },
  ): Promise<ApiResponse<T>> {
    const { data, ...rest } = config || {};

    const result = await this.request<T>(endpoint, {
      ...rest,
      method: "DELETE",
      ...(data ? { body: JSON.stringify(data) } : {}),
    });

    if (!result.error) {
      request_cache.invalidate_for_mutation(endpoint);
    }

    return result;
  }
}

export const api_client = new ApiClient();

if (import.meta.hot) {
  interface HmrState {
    is_authenticated: boolean;
    initial_auth_verified: boolean;
    dev_access_token: string | null;
  }

  const prev = import.meta.hot.data as Partial<HmrState> | undefined;

  if (prev?.is_authenticated) {
    api_client.set_authenticated(true);
    api_client.set_initial_auth_verified(prev.initial_auth_verified ?? false);
    if (prev.dev_access_token) {
      api_client.set_dev_token(prev.dev_access_token);
    }
  }

  import.meta.hot.dispose((data: HmrState) => {
    data.is_authenticated = api_client.is_authenticated();
    data.initial_auth_verified = api_client.is_initial_auth_verified();
    data.dev_access_token = api_client.get_access_token();
  });
}
