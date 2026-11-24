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
import type {
  GuardRequiredInfo,
  GuardSignInMethod,
} from "@/services/api/client/helpers";
import type { GuardDevice } from "@/services/guard/guard_device";
import type {
  GuardResume,
  GuardRescueStart,
  GuardSignInComplete,
  GuardSignInStatus,
} from "@/services/api/guard";

import {
  base64url_decode,
  base64url_encode,
} from "@/lib/crypto/device_envelope";
import {
  build_action_message,
  GUARD_ACTION,
  keys_digest,
  number_hash,
  random_number,
} from "@/lib/crypto/guard_action";
import { ALL_GUARD_SIGN_IN_METHODS } from "@/services/api/client/helpers";
import { GUARD_ALPHABET, GUARD_CODE_LENGTH } from "@/lib/crypto/guard_code";
import { normalize_rescue_code } from "@/lib/crypto/guard_rescue_code";
import { server_now } from "@/lib/server_clock";
import { default_guard_device_name } from "@/services/guard/guard_device_label";
import { code_secret_aad } from "@/lib/crypto/guard_seal";
import {
  GUARD_ENVELOPE_VERSIONS,
  guard_sign_in_begin,
  guard_sign_in_code,
  guard_sign_in_complete,
  guard_sign_in_rescue,
  guard_sign_in_resume_nonce,
  guard_sign_in_status,
} from "@/services/api/guard";
import {
  create_guard_device,
  get_guard_device,
  read_guard_hint,
  rekey_guard_device,
  write_guard_hint,
} from "@/services/guard/guard_device";

export const GUARD_SIGN_IN_STORAGE_KEY = "aster_guard_sign_in";
export const GUARD_POLL_INTERVAL_MS = 1000;
const GUARD_ERROR_RETRY_MS = 3000;
const PENDING_PREFIX = "pending:";

export type GuardSignInPhase =
  | "starting"
  | "waiting"
  | "denied"
  | "expired"
  | "paused"
  | "completing"
  | "rescue"
  | "done"
  | "on_hold"
  | "error";

export type GuardRescueError =
  | "invalid"
  | "not_allowed"
  | "paused"
  | "in_progress"
  | "failed";

export interface GuardSignInState {
  phase: GuardSignInPhase;
  number: number | null;
  expires_at: string | null;
  methods: GuardSignInMethod[];
  code_error: boolean;
  rescue_error: GuardRescueError | null;
  rescue: GuardRescueStart | null;
  error_code?: string | null;
  retry_at?: string | null;
}

export interface GuardEndSource {
  server_code?: string;
  status?: number;
  retry_after_secs?: number;
}

function retry_at_from(
  retry_after_secs: number | undefined,
  now: number,
): string | null {
  if (typeof retry_after_secs !== "number" || !(retry_after_secs > 0)) {
    return null;
  }

  return new Date(now + retry_after_secs * 1000).toISOString();
}

export function rescue_error_for(
  server_code: string | undefined,
  status: number | undefined,
): GuardRescueError {
  if (server_code === "GUARD_RESCUE_CODE_INVALID") return "invalid";
  if (server_code === "GUARD_NOT_ALLOWED") return "not_allowed";
  if (server_code === "GUARD_REQUEST_CONFLICT") return "in_progress";
  if (
    server_code === "GUARD_PAUSED" ||
    server_code === "GUARD_TOO_MANY_REQUESTS" ||
    status === 429
  ) {
    return "paused";
  }

  return "failed";
}

export interface StoredGuardSignIn {
  request_id: string;
  guard_token: string;
  expires_at: string;
  number: number;
  device_key: string;
  user_hash: string | null;
  user_id?: string | null;
  methods?: GuardSignInMethod[];
}

export type GuardSignInStart =
  | { kind: "fresh"; info: GuardRequiredInfo; user_hash: string | null }
  | { kind: "stored"; stored: StoredGuardSignIn };

export type GuardSignInFinish = (
  response: GuardSignInComplete,
  passphrase: string | null,
) => Promise<void>;

export interface GuardSignInDeps {
  get_device: (key: string) => Promise<GuardDevice | null>;
  create_device: (key: string, name: string) => Promise<GuardDevice>;
  rekey_device: (from: string, to: string) => Promise<void>;
  read_hint: (user_hash: string) => Promise<string | null>;
  write_hint: (user_hash: string, user_id: string) => Promise<void>;
  device_name: () => string;
  storage: () => Storage | null;
  now: () => number;
}

function session_storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export {
  default_guard_device_name,
  guard_device_label,
} from "@/services/guard/guard_device_label";

export const default_guard_sign_in_deps: GuardSignInDeps = {
  get_device: get_guard_device,
  create_device: create_guard_device,
  rekey_device: rekey_guard_device,
  read_hint: read_guard_hint,
  write_hint: write_guard_hint,
  device_name: default_guard_device_name,
  storage: session_storage,
  now: () => server_now(),
};

function is_stored(value: unknown): value is StoredGuardSignIn {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  return (
    typeof v.request_id === "string" &&
    typeof v.guard_token === "string" &&
    typeof v.expires_at === "string" &&
    typeof v.number === "number" &&
    typeof v.device_key === "string" &&
    (v.user_hash === null || typeof v.user_hash === "string") &&
    (v.user_id === undefined ||
      v.user_id === null ||
      typeof v.user_id === "string")
  );
}

export function read_stored_guard_sign_in(
  storage: Storage | null = session_storage(),
  now: number = server_now(),
): StoredGuardSignIn | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(GUARD_SIGN_IN_STORAGE_KEY);

    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);

    if (!is_stored(parsed) || Date.parse(parsed.expires_at) <= now) {
      storage.removeItem(GUARD_SIGN_IN_STORAGE_KEY);

      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function normalize_guard_code(input: string): string | null {
  const value = input.toUpperCase().replace(/[\s-]/g, "");

  if (value.length !== GUARD_CODE_LENGTH) return null;
  for (const ch of value) {
    if (!GUARD_ALPHABET.includes(ch)) return null;
  }

  return value;
}

export function begin_failure_phase(
  server_code: string | undefined,
  status: number | undefined,
): "expired" | "on_hold" | "error" {
  if (is_gone(server_code, status)) return "expired";
  if (
    server_code === "GUARD_TOO_MANY_REQUESTS" ||
    server_code === "GUARD_PAUSED" ||
    status === 429
  ) {
    return "on_hold";
  }

  return "error";
}

function is_gone(server_code: string | undefined, status: number | undefined) {
  return server_code === "GUARD_REQUEST_GONE" || status === 410;
}

export class GuardSignInController {
  private state: GuardSignInState;
  private readonly listeners = new Set<(s: GuardSignInState) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private started = false;
  private finishing = false;
  private canceled = false;
  private request_id: string;
  private token: string;
  private expires_at: string;
  private device_key: string | null = null;
  private user_hash: string | null;
  private account_id: string | null;
  private number: number | null = null;
  private readonly methods: GuardSignInMethod[];
  private readonly start_from: GuardSignInStart;

  constructor(
    start: GuardSignInStart,
    private finish: GuardSignInFinish,
    private readonly deps: GuardSignInDeps = default_guard_sign_in_deps,
  ) {
    this.start_from = start;
    if (start.kind === "fresh") {
      this.request_id = start.info.request_id;
      this.token = start.info.guard_token;
      this.expires_at = start.info.expires_at;
      this.user_hash = start.user_hash;
      this.account_id = start.info.user_id ?? null;
      this.methods = [...start.info.methods];
    } else {
      this.request_id = start.stored.request_id;
      this.token = start.stored.guard_token;
      this.expires_at = start.stored.expires_at;
      this.user_hash = start.stored.user_hash;
      this.account_id = start.stored.user_id ?? null;
      this.device_key = start.stored.device_key;
      this.number = start.stored.number;
      this.methods = Array.isArray(start.stored.methods)
        ? [...start.stored.methods]
        : [...ALL_GUARD_SIGN_IN_METHODS];
    }
    this.state = {
      phase: start.kind === "fresh" ? "starting" : "waiting",
      number: this.number,
      expires_at: this.expires_at,
      methods: this.methods,
      code_error: false,
      rescue_error: null,
      rescue: null,
      error_code: null,
      retry_at: null,
    };
  }

  get_request_id(): string {
    return this.request_id;
  }

  get_state(): GuardSignInState {
    return this.state;
  }

  set_finish(finish: GuardSignInFinish): void {
    this.finish = finish;
  }

  subscribe(listener: (s: GuardSignInState) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  listener_count(): number {
    return this.listeners.size;
  }

  private update(patch: Partial<GuardSignInState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private clear_timer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(ms: number): void {
    this.clear_timer();
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, ms);
  }

  private expired_now(): boolean {
    return Date.parse(this.expires_at) <= this.deps.now();
  }

  private save(): void {
    const storage = this.deps.storage();

    if (!storage || this.device_key === null || this.number === null) return;
    const value: StoredGuardSignIn = {
      request_id: this.request_id,
      guard_token: this.token,
      expires_at: this.expires_at,
      number: this.number,
      device_key: this.device_key,
      user_hash: this.user_hash,
      user_id: this.account_id,
      methods: this.methods,
    };

    try {
      storage.setItem(GUARD_SIGN_IN_STORAGE_KEY, JSON.stringify(value));
    } catch {
      return;
    }
  }

  private forget_storage(): void {
    try {
      this.deps.storage()?.removeItem(GUARD_SIGN_IN_STORAGE_KEY);
    } catch {
      return;
    }
  }

  private async drop_pending_device(): Promise<void> {
    if (!this.device_key?.startsWith(PENDING_PREFIX)) return;
    const device = await this.deps.get_device(this.device_key).catch(() => null);

    await device?.forget().catch(() => undefined);
  }

  private end(
    phase: "denied" | "expired" | "on_hold" | "error",
    source?: GuardEndSource,
  ): void {
    this.clear_timer();
    this.stopped = true;
    this.forget_storage();
    void this.drop_pending_device();
    this.update({
      phase,
      error_code:
        source?.server_code ??
        (source?.status === 426 ? "CLIENT_UPGRADE_REQUIRED" : null),
      retry_at: retry_at_from(source?.retry_after_secs, this.deps.now()),
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.expired_now()) {
      this.end("expired");

      return;
    }
    if (this.start_from.kind === "stored") {
      this.update({ phase: "waiting" });
      this.schedule(0);

      return;
    }
    void this.begin();
  }

  private async resume_part(): Promise<{
    device: GuardDevice;
    key: string;
    resume: GuardResume;
  } | null> {
    const user_id =
      this.account_id ??
      (this.user_hash
        ? await this.deps.read_hint(this.user_hash).catch(() => null)
        : null);

    if (!user_id) return null;
    const device = await this.deps.get_device(user_id).catch(() => null);
    const device_id = device ? await device.device_id() : null;

    if (!device || !device_id) return null;
    const nonce = await guard_sign_in_resume_nonce(this.token, { device_id });

    if (nonce.error || !nonce.data) {
      if (
        nonce.status === 404 ||
        is_gone(nonce.server_code, nonce.status)
      ) {
        return null;
      }
      throw new Error("guard_sign_in: resume unavailable");
    }
    const pub = await device.public_keys();
    const digest = keys_digest(
      pub.ed25519_pk,
      pub.mlkem_pk,
      pub.x25519_pk,
      pub.action_pk,
    );
    const message = build_action_message(
      GUARD_ACTION.resume,
      user_id,
      base64url_decode(nonce.data.nonce),
      digest,
    );
    const signature = await device.sign(message);

    return {
      device,
      key: user_id,
      resume: {
        device_id,
        nonce: nonce.data.nonce,
        signature: base64url_encode(signature),
      },
    };
  }

  private async begin(): Promise<void> {
    try {
      const resumed = await this.resume_part();
      let device: GuardDevice;
      let resume: GuardResume | null = null;

      if (resumed) {
        device = resumed.device;
        this.device_key = resumed.key;
        resume = resumed.resume;
      } else {
        this.device_key = `${PENDING_PREFIX}${this.request_id}`;
        device = await this.deps.create_device(
          this.device_key,
          this.deps.device_name(),
        );
      }
      if (this.stopped) {
        await this.drop_pending_device();

        return;
      }

      const pub = await device.public_keys();

      this.number = random_number();
      const response = await guard_sign_in_begin(this.token, {
        device: {
          ed25519_pk: base64url_encode(pub.ed25519_pk),
          mlkem_pk: base64url_encode(pub.mlkem_pk),
          x25519_pk: base64url_encode(pub.x25519_pk),
          action_pk: base64url_encode(pub.action_pk),
          device_type: pub.device_type,
          name: pub.name,
        },
        envelope_versions: [...GUARD_ENVELOPE_VERSIONS],
        number_hash: base64url_encode(number_hash(this.request_id, this.number)),
        resume,
      });

      if (this.stopped) {
        await this.drop_pending_device();

        return;
      }
      if (response.error || !response.data) {
        this.end(
          begin_failure_phase(response.server_code, response.status),
          response,
        );

        return;
      }
      if (response.data.expires_at) this.expires_at = response.data.expires_at;
      this.save();
      this.update({
        phase: "waiting",
        number: this.number,
        expires_at: this.expires_at,
      });
      if (response.data.status === "approved") {
        await this.complete();

        return;
      }
      this.schedule(GUARD_POLL_INTERVAL_MS);
    } catch {
      if (!this.stopped) this.end("error");
    }
  }

  private async poll(): Promise<void> {
    if (this.stopped || this.finishing) return;
    if (this.expired_now()) {
      this.end("expired");

      return;
    }
    const response = await guard_sign_in_status(this.token);

    if (this.stopped || this.finishing) return;
    if (response.error || !response.data) {
      if (is_gone(response.server_code, response.status)) {
        this.end("expired");

        return;
      }
      if (
        response.server_code === "GUARD_TOO_MANY_REQUESTS" ||
        response.server_code === "GUARD_PAUSED" ||
        response.status === 429
      ) {
        const secs = Math.max(1, response.retry_after_secs ?? 1);

        if (response.server_code === "GUARD_PAUSED") {
          this.update({
            phase: "paused",
            retry_at: retry_at_from(secs, this.deps.now()),
          });
        }

        this.schedule(secs * 1000);

        return;
      }
      if (
        response.status === 426 ||
        response.server_code === "CLIENT_UPGRADE_REQUIRED" ||
        response.server_code === "GUARD_DISABLED"
      ) {
        this.end("error", response);

        return;
      }
      this.schedule(GUARD_ERROR_RETRY_MS);

      return;
    }
    this.on_status(response.data.status, response.data.apply_after);
  }

  private on_status(status: GuardSignInStatus, apply_after: string | null) {
    switch (status) {
      case "approved":
        void this.complete();

        return;
      case "denied":
        this.end("denied");

        return;
      case "expired":
      case "completed":
        this.end("expired");

        return;
      case "rescue_pending":
        this.clear_timer();
        this.stopped = true;
        this.forget_storage();
        void this.drop_pending_device();
        this.update({
          phase: "rescue",
          rescue: this.state.rescue ?? {
            rescue_id: "",
            apply_after: apply_after ?? "",
            account_id: this.account_id,
          },
        });

        return;
      default:
        if (this.state.phase === "paused") {
          this.update({ phase: "waiting", retry_at: null });
        }
        this.schedule(GUARD_POLL_INTERVAL_MS);
    }
  }

  private async request_completion(): Promise<
    Awaited<ReturnType<typeof guard_sign_in_complete>>
  > {
    const response = await guard_sign_in_complete(this.token);

    if (!response.error || response.data || this.canceled) return response;
    if (response.server_code || (response.status && response.status < 500)) {
      return response;
    }

    return guard_sign_in_complete(this.token);
  }

  private async run_finish(
    data: Parameters<GuardSignInFinish>[0],
    passphrase: string | null,
  ): Promise<void> {
    try {
      await this.finish(data, passphrase);
    } catch {
      if (this.canceled) return;
      await this.finish(data, passphrase);
    }
  }

  private async complete(): Promise<void> {
    if (this.finishing || this.stopped) return;
    this.finishing = true;
    this.clear_timer();
    this.update({ phase: "completing" });

    try {
      const response = await this.request_completion();

      if (this.canceled) return;
      if (response.error || !response.data) {
        this.finishing = false;
        this.end(
          is_gone(response.server_code, response.status) ? "expired" : "error",
        );

        return;
      }
      const data = response.data;
      const user_id = typeof data.user_id === "string" ? data.user_id : null;
      const key = this.device_key;

      if (!user_id || !key) throw new Error("guard_sign_in: incomplete");
      if (this.account_id && this.account_id !== user_id) {
        throw new Error("guard_sign_in: account mismatch");
      }
      const device = await this.deps.get_device(key);

      if (this.canceled) return;
      if (!device) throw new Error("guard_sign_in: device missing");
      const device_id = data.guard.device_id;

      await device.set_device_id(device_id);
      await this.store_code_secret(device, device_id, data.guard.code_secret_sealed);

      let passphrase: string | null = null;

      if (data.guard.approval_envelope) {
        const bytes = await device.open_envelope(
          base64url_decode(data.guard.approval_envelope),
          device_id,
        );

        try {
          passphrase = new TextDecoder().decode(bytes);
        } finally {
          bytes.fill(0);
        }
      }
      if (this.canceled) return;
      if (key !== user_id) await this.deps.rekey_device(key, user_id);
      if (this.user_hash) {
        await this.deps.write_hint(this.user_hash, user_id).catch(() => undefined);
      }
      if (this.canceled) return;
      this.stopped = true;
      this.forget_storage();
      this.update({ phase: "done" });
      await this.run_finish(data, passphrase);
    } catch {
      this.finishing = false;
      if (this.canceled) return;
      this.end("error");
    }
  }

  private async store_code_secret(
    device: GuardDevice,
    device_id: string,
    sealed: string,
  ): Promise<void> {
    try {
      const secret = await device.open_seal(
        base64url_decode(sealed),
        code_secret_aad(device_id),
      );

      try {
        await device.store_code_secret(secret);
      } finally {
        secret.fill(0);
      }
    } catch {
      return;
    }
  }

  async submit_code(input: string): Promise<void> {
    if (this.stopped || this.finishing) return;
    const code = normalize_guard_code(input);

    if (!code) {
      this.update({ code_error: true });

      return;
    }
    this.update({ code_error: false });
    const response = await guard_sign_in_code(this.token, code);

    if (this.stopped) return;
    if (response.error || !response.data) {
      if (is_gone(response.server_code, response.status)) {
        this.end("expired");
      } else if (response.server_code === "GUARD_PAUSED") {
        this.update({
          phase: "paused",
          code_error: true,
          retry_at: retry_at_from(response.retry_after_secs, this.deps.now()),
        });
      } else {
        this.update({ code_error: true });
      }

      return;
    }
    if (response.data.status === "approved") await this.complete();
  }

  async start_rescue(input: string): Promise<boolean> {
    if (this.stopped || this.finishing) return false;
    const code = normalize_rescue_code(input);

    if (!code) {
      this.update({ rescue_error: "invalid" });

      return false;
    }
    const response = await guard_sign_in_rescue(this.token, code);

    if (this.stopped || this.finishing) return false;
    if (response.error || !response.data) {
      if (is_gone(response.server_code, response.status)) {
        this.end("expired");
      } else {
        this.update({
          rescue_error: rescue_error_for(response.server_code, response.status),
        });
      }

      return false;
    }
    this.clear_timer();
    this.stopped = true;
    this.forget_storage();
    void this.drop_pending_device();
    this.update({
      phase: "rescue",
      rescue: { ...response.data, account_id: this.account_id },
      rescue_error: null,
    });

    return true;
  }

  stop(): void {
    this.clear_timer();
    this.stopped = true;
  }

  cancel(): void {
    this.clear_timer();
    this.canceled = true;
    this.stopped = true;
    this.forget_storage();
    void this.drop_pending_device();
  }
}
