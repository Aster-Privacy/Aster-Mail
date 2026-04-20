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
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  trigger_sync,
  type DecryptedExternalAccount,
} from "@/services/api/external_accounts";
import { get_or_create_derived_encryption_crypto_key } from "@/services/crypto/memory_key_store";
import { array_to_base64, base64_to_array } from "@/services/api/sender_utils";

export type SyncInterval = "5m" | "15m" | "30m" | "1h" | "2h" | "6h" | "manual";

const VALID_INTERVALS: ReadonlySet<string> = new Set<SyncInterval>([
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "6h",
  "manual",
]);

export interface SyncScheduleConfig {
  account_token: string;
  interval: SyncInterval;
  is_paused: boolean;
}

export interface SyncAccountState {
  account_token: string;
  interval: SyncInterval;
  next_sync_at: number | null;
  last_sync_at: number | null;
  last_sync_status: "success" | "error" | null;
  consecutive_failures: number;
  is_syncing: boolean;
}

export type SyncEvent =
  | { type: "sync_started"; account_token: string }
  | { type: "sync_completed"; account_token: string }
  | { type: "sync_failed"; account_token: string; error: string }
  | { type: "state_changed" };

const SYNC_EVENT_NAME = "astermail:external-sync";
const STORAGE_KEY = "aster_sync_schedules";
const MAX_BACKOFF_MS = 30 * 60 * 1000;
const BASE_BACKOFF_MS = 60 * 1000;

const INTERVAL_MS_MAP: Record<SyncInterval, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  manual: 0,
};

function is_valid_interval(value: string): value is SyncInterval {
  return VALID_INTERVALS.has(value);
}

function dispatch_sync_event(detail: SyncEvent): void {
  window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME, { detail }));
}

class ExternalSyncScheduler {
  private configs: Map<string, SyncScheduleConfig> = new Map();
  private states: Map<string, SyncAccountState> = new Map();
  private timers: Map<string, number> = new Map();
  private listeners: Set<(states: SyncAccountState[]) => void> = new Set();
  private is_page_visible: boolean = true;
  private visibility_handler: (() => void) | null = null;
  private is_initialized: boolean = false;
  private paused_by_visibility: Set<string> = new Set();
  private generation: number = 0;
  private active_syncs: Set<string> = new Set();

  async initialize(accounts: DecryptedExternalAccount[]): Promise<void> {
    if (this.is_initialized) {
      this.destroy();
    }

    this.generation += 1;
    const current_generation = this.generation;

    this.is_initialized = true;

    const stored_configs = await this.load_configs();

    if (this.generation !== current_generation) {
      return;
    }

    const seen_tokens = new Set<string>();

    for (const account of accounts) {
      if (!account.is_enabled || !account.is_verified) {
        continue;
      }

      if (!account.account_token || typeof account.account_token !== "string") {
        continue;
      }

      if (seen_tokens.has(account.account_token)) {
        continue;
      }

      seen_tokens.add(account.account_token);

      const existing = stored_configs.find(
        (c) => c.account_token === account.account_token,
      );

      const config: SyncScheduleConfig = existing || {
        account_token: account.account_token,
        interval: "15m",
        is_paused: false,
      };

      this.configs.set(account.account_token, config);

      this.states.set(account.account_token, {
        account_token: account.account_token,
        interval: config.interval,
        next_sync_at: null,
        last_sync_at: account.last_sync_at
          ? new Date(account.last_sync_at).getTime()
          : null,
        last_sync_status: this.normalize_sync_status(account.last_sync_status),
        consecutive_failures: 0,
        is_syncing: false,
      });

      if (!config.is_paused && config.interval !== "manual") {
        this.schedule_timer(account.account_token);
      }
    }

    await this.persist_configs();

    if (this.generation !== current_generation) {
      return;
    }

    this.attach_visibility_listener();
    this.notify_listeners();
  }

  async set_interval(
    account_token: string,
    interval: SyncInterval,
  ): Promise<void> {
    const config = this.configs.get(account_token);

    if (!config) {
      return;
    }

    config.interval = interval;
    this.configs.set(account_token, config);

    const state = this.states.get(account_token);

    if (state) {
      state.interval = interval;
      state.consecutive_failures = 0;
      this.states.set(account_token, state);
    }

    this.clear_timer(account_token);

    if (!config.is_paused && interval !== "manual") {
      this.schedule_timer(account_token);
    } else {
      if (state) {
        state.next_sync_at = null;
        this.states.set(account_token, state);
      }
    }

    await this.persist_configs();
    this.notify_listeners();
  }

  get_state(account_token: string): SyncAccountState | undefined {
    const state = this.states.get(account_token);

    if (!state) {
      return undefined;
    }

    return { ...state };
  }

  get_all_states(): SyncAccountState[] {
    return Array.from(this.states.values()).map((s) => ({ ...s }));
  }

  async sync_now(account_token: string): Promise<void> {
    await this.execute_sync(account_token);
  }

  async pause(account_token: string): Promise<void> {
    const config = this.configs.get(account_token);

    if (!config) {
      return;
    }

    config.is_paused = true;
    this.configs.set(account_token, config);
    this.clear_timer(account_token);

    const state = this.states.get(account_token);

    if (state) {
      state.next_sync_at = null;
      this.states.set(account_token, state);
    }

    await this.persist_configs();
    this.notify_listeners();
  }

  async resume(account_token: string): Promise<void> {
    const config = this.configs.get(account_token);

    if (!config) {
      return;
    }

    config.is_paused = false;
    this.configs.set(account_token, config);

    if (config.interval !== "manual") {
      this.schedule_timer(account_token);
    }

    await this.persist_configs();
    this.notify_listeners();
  }

  async pause_all(): Promise<void> {
    for (const [account_token, config] of this.configs) {
      config.is_paused = true;
      this.configs.set(account_token, config);
      this.clear_timer(account_token);

      const state = this.states.get(account_token);

      if (state) {
        state.next_sync_at = null;
        this.states.set(account_token, state);
      }
    }

    await this.persist_configs();
    this.notify_listeners();
  }

  async resume_all(): Promise<void> {
    for (const [account_token, config] of this.configs) {
      config.is_paused = false;
      this.configs.set(account_token, config);

      if (config.interval !== "manual") {
        this.schedule_timer(account_token);
      }
    }

    await this.persist_configs();
    this.notify_listeners();
  }

  destroy(): void {
    this.generation += 1;

    for (const [account_token] of this.timers) {
      this.clear_timer(account_token);
    }

    this.timers.clear();
    this.configs.clear();
    this.states.clear();
    this.paused_by_visibility.clear();
    this.active_syncs.clear();
    this.detach_visibility_listener();
    this.is_initialized = false;
  }

  subscribe(listener: (states: SyncAccountState[]) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private normalize_sync_status(
    status: string | null,
  ): "success" | "error" | null {
    if (!status) {
      return null;
    }

    if (status === "success" || status === "completed") {
      return "success";
    }

    if (status === "error" || status === "failed") {
      return "error";
    }

    return null;
  }

  private schedule_timer(account_token: string): void {
    this.clear_timer(account_token);

    const config = this.configs.get(account_token);
    const state = this.states.get(account_token);

    if (!config || !state || config.interval === "manual" || config.is_paused) {
      return;
    }

    if (!this.is_page_visible) {
      this.paused_by_visibility.add(account_token);
      state.next_sync_at = null;
      this.states.set(account_token, state);

      return;
    }

    const base_interval = INTERVAL_MS_MAP[config.interval];
    let delay = base_interval;

    if (state.consecutive_failures > 0) {
      const backoff =
        BASE_BACKOFF_MS * Math.pow(2, state.consecutive_failures - 1);

      delay = Math.max(base_interval, Math.min(backoff, MAX_BACKOFF_MS));
    }

    const next_sync_at = Date.now() + delay;

    state.next_sync_at = next_sync_at;
    this.states.set(account_token, state);

    const timer_id = window.setTimeout(() => {
      this.timers.delete(account_token);
      this.execute_sync(account_token);
    }, delay);

    this.timers.set(account_token, timer_id);
  }

  private clear_timer(account_token: string): void {
    const timer_id = this.timers.get(account_token);

    if (timer_id !== undefined) {
      window.clearTimeout(timer_id);
      this.timers.delete(account_token);
    }
  }

  private async execute_sync(account_token: string): Promise<void> {
    const state = this.states.get(account_token);

    if (!state || state.is_syncing) {
      return;
    }

    if (this.active_syncs.has(account_token)) {
      return;
    }

    const generation_at_start = this.generation;

    this.active_syncs.add(account_token);

    state.is_syncing = true;
    this.states.set(account_token, state);

    dispatch_sync_event({ type: "sync_started", account_token });
    this.notify_listeners();

    try {
      const result = await trigger_sync(account_token);

      if (this.generation !== generation_at_start) {
        return;
      }

      const current_state = this.states.get(account_token);

      if (!current_state) {
        return;
      }

      current_state.is_syncing = false;
      current_state.last_sync_at = Date.now();

      if (result.error) {
        current_state.last_sync_status = "error";
        current_state.consecutive_failures += 1;

        dispatch_sync_event({
          type: "sync_failed",
          account_token,
          error: result.error,
        });
      } else {
        current_state.last_sync_status = "success";
        current_state.consecutive_failures = 0;

        dispatch_sync_event({ type: "sync_completed", account_token });
      }

      this.states.set(account_token, current_state);
    } catch {
      if (this.generation !== generation_at_start) {
        return;
      }

      const current_state = this.states.get(account_token);

      if (!current_state) {
        return;
      }

      current_state.is_syncing = false;
      current_state.last_sync_at = Date.now();
      current_state.last_sync_status = "error";
      current_state.consecutive_failures += 1;

      this.states.set(account_token, current_state);

      dispatch_sync_event({
        type: "sync_failed",
        account_token,
        error: "Unexpected sync failure",
      });
    } finally {
      this.active_syncs.delete(account_token);
    }

    if (this.generation !== generation_at_start) {
      return;
    }

    const config = this.configs.get(account_token);
    const final_state = this.states.get(account_token);

    if (config && !config.is_paused && config.interval !== "manual") {
      this.schedule_timer(account_token);
    } else if (final_state) {
      final_state.next_sync_at = null;
      this.states.set(account_token, final_state);
    }

    this.notify_listeners();
  }

  private notify_listeners(): void {
    const all_states = this.get_all_states();

    dispatch_sync_event({ type: "state_changed" });

    for (const listener of this.listeners) {
      try {
        listener(all_states);
      } catch {
        continue;
      }
    }
  }

  private attach_visibility_listener(): void {
    if (this.visibility_handler) {
      return;
    }

    this.is_page_visible = document.visibilityState === "visible";

    this.visibility_handler = () => {
      const was_visible = this.is_page_visible;

      this.is_page_visible = document.visibilityState === "visible";

      if (!was_visible && this.is_page_visible) {
        this.on_page_visible();
      } else if (was_visible && !this.is_page_visible) {
        this.on_page_hidden();
      }
    };

    document.addEventListener("visibilitychange", this.visibility_handler);
  }

  private detach_visibility_listener(): void {
    if (this.visibility_handler) {
      document.removeEventListener("visibilitychange", this.visibility_handler);
      this.visibility_handler = null;
    }
  }

  private on_page_hidden(): void {
    for (const [account_token, config] of this.configs) {
      if (!config.is_paused && config.interval !== "manual") {
        this.paused_by_visibility.add(account_token);
        this.clear_timer(account_token);

        const state = this.states.get(account_token);

        if (state) {
          state.next_sync_at = null;
          this.states.set(account_token, state);
        }
      }
    }
  }

  private on_page_visible(): void {
    for (const account_token of this.paused_by_visibility) {
      const config = this.configs.get(account_token);

      if (config && !config.is_paused && config.interval !== "manual") {
        this.schedule_timer(account_token);
      }
    }

    this.paused_by_visibility.clear();
    this.notify_listeners();
  }

  private async load_configs(): Promise<SyncScheduleConfig[]> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return [];
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(raw);
      } catch {
        localStorage.removeItem(STORAGE_KEY);

        return [];
      }

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("iv" in parsed) ||
        !("data" in parsed)
      ) {
        localStorage.removeItem(STORAGE_KEY);

        return [];
      }

      const envelope = parsed as { iv: unknown; data: unknown };

      if (
        typeof envelope.iv !== "string" ||
        typeof envelope.data !== "string" ||
        envelope.iv.length === 0 ||
        envelope.data.length === 0
      ) {
        localStorage.removeItem(STORAGE_KEY);

        return [];
      }

      const key = await get_or_create_derived_encryption_crypto_key();

      if (!key) {
        return [];
      }

      const iv = base64_to_array(envelope.iv as string);
      const ciphertext = base64_to_array(envelope.data as string);

      const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, iv);

      const decoder = new TextDecoder();
      const configs: unknown = JSON.parse(decoder.decode(decrypted));

      if (!Array.isArray(configs)) {
        return [];
      }

      return configs.filter(
        (c): c is SyncScheduleConfig =>
          c !== null &&
          typeof c === "object" &&
          typeof c.account_token === "string" &&
          c.account_token.length > 0 &&
          typeof c.interval === "string" &&
          is_valid_interval(c.interval) &&
          typeof c.is_paused === "boolean",
      );
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* localStorage may be unavailable */
      }

      return [];
    }
  }

  private async persist_configs(): Promise<void> {
    try {
      const key = await get_or_create_derived_encryption_crypto_key();

      if (!key) {
        return;
      }

      const configs = Array.from(this.configs.values());
      const encoder = new TextEncoder();
      const plaintext = encoder.encode(JSON.stringify(configs));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        plaintext,
      );

      const stored = {
        iv: array_to_base64(iv),
        data: array_to_base64(new Uint8Array(ciphertext)),
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch {
        /* localStorage may be full or unavailable */
      }
    } catch {
      return;
    }
  }
}

export const sync_scheduler = new ExternalSyncScheduler();
