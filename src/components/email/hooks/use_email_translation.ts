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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  derive_accepted_languages,
  primary_target,
} from "@/services/translation/accepted_languages";
import {
  mark_translated,
  restore_originals,
  restore_translated,
} from "@/services/translation/dom_translate";
import {
  has_limited_quality,
  type LanguageCode,
  normalize_language,
} from "@/services/translation/engine_types";
import {
  decide_translation,
  should_keep_translation,
} from "@/services/translation/language_detect";
import {
  translate_message_body,
  translate_plain_text,
} from "@/services/translation/translate_document";

export type TranslationStatus =
  | "idle"
  | "offer"
  | "translating"
  | "translated"
  | "unavailable";

export interface EmailTranslationControl {
  status: TranslationStatus;
  source_language: LanguageCode | null;
  target_language: LanguageCode;
  limited_quality: boolean;
  showing_original: boolean;
  translated_subject: string | null;
  translate: () => void;
  show_original: () => void;
  on_document_ready: (
    body: HTMLElement,
    request_remeasure: () => void,
  ) => () => void;
}

export interface EmailTranslationInput {
  account_id: string;
  email_id: string;
  subject: string;
  translatable: boolean;
}

interface RenderTarget {
  body: HTMLElement;
  remeasure: () => void;
}

function read_body_text(body: HTMLElement): string {
  const text = body.innerText || body.textContent || "";

  return text.slice(0, 20000);
}

const BODY_REVEAL_FALLBACK_MS = 300;

function animate_body_swap(body: HTMLElement, remeasure: () => void): void {
  const view = body.ownerDocument?.defaultView ?? null;

  body.style.transition = "none";
  body.style.opacity = "0";

  remeasure();

  const reveal = () => {
    body.style.transition = "opacity 260ms ease";
    body.style.opacity = "1";
  };

  const parent = typeof window !== "undefined" ? window : view;

  parent?.setTimeout(reveal, BODY_REVEAL_FALLBACK_MS);

  if (view && typeof view.requestAnimationFrame === "function") {
    view.requestAnimationFrame(() => view.requestAnimationFrame(reveal));
  } else {
    reveal();
  }
}

export function use_email_translation({
  account_id,
  email_id,
  subject,
  translatable,
}: EmailTranslationInput): EmailTranslationControl {
  const { preferences } = use_preferences();
  const { language: ui_locale } = use_i18n();

  const accepted = useMemo(
    () =>
      derive_accepted_languages(
        preferences.translate_languages,
        ui_locale,
        typeof navigator !== "undefined" ? navigator.languages : [],
      ),
    [preferences.translate_languages, ui_locale],
  );

  const target_language = useMemo(
    () => primary_target(accepted, ui_locale),
    [accepted, ui_locale],
  );

  const never_languages = useMemo(() => {
    const set = new Set<LanguageCode>();

    for (const value of preferences.translate_never_languages) {
      const code = normalize_language(value);

      if (code) set.add(code);
    }

    return set;
  }, [preferences.translate_never_languages]);

  const configured_accepted = useMemo(() => {
    const result: LanguageCode[] = [];

    for (const value of preferences.translate_languages) {
      const code = normalize_language(value);

      if (code && !result.includes(code)) result.push(code);
    }

    return result;
  }, [preferences.translate_languages]);

  const mode = preferences.translate_incoming;

  const [status, set_status] = useState<TranslationStatus>("idle");
  const [source_language, set_source_language] = useState<LanguageCode | null>(
    null,
  );
  const [showing_original, set_showing_original] = useState(false);
  const [translated_subject, set_translated_subject] = useState<string | null>(
    null,
  );
  const showing_original_ref = useRef(showing_original);

  showing_original_ref.current = showing_original;

  const target_ref = useRef<RenderTarget | null>(null);
  const abort_ref = useRef<AbortController | null>(null);
  const source_ref = useRef<LanguageCode | null>(null);
  const last_translated_subject_ref = useRef<string | null>(null);
  const status_ref = useRef<TranslationStatus>(status);
  const config_ref = useRef({
    mode,
    target_language,
    configured_accepted,
    never_languages,
  });

  config_ref.current = {
    mode,
    target_language,
    configured_accepted,
    never_languages,
  };
  status_ref.current = status;

  const abort_active = useCallback(() => {
    abort_ref.current?.abort();
    abort_ref.current = null;
  }, []);

  useEffect(() => {
    abort_active();
    target_ref.current = null;
    source_ref.current = null;
    last_translated_subject_ref.current = null;
    set_status("idle");
    set_source_language(null);
    set_showing_original(false);
    set_translated_subject(null);
  }, [email_id, abort_active]);

  useEffect(() => abort_active, [abort_active]);

  const run_translation = useCallback(
    async (from: LanguageCode) => {
      const render = target_ref.current;
      const { target_language: to } = config_ref.current;

      if (!render || from === to) return;

      abort_active();

      const controller = new AbortController();

      abort_ref.current = controller;
      set_status("translating");

      const result = await translate_message_body({
        root: render.body,
        account_id,
        message_id: email_id,
        from,
        to,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!result.translated) {
        render.remeasure();
        set_status("unavailable");

        return;
      }

      animate_body_swap(render.body, render.remeasure);
      set_showing_original(false);
      set_status("translated");

      const next_subject = await translate_plain_text(
        subject,
        from,
        to,
        controller.signal,
      );

      if (controller.signal.aborted) return;

      last_translated_subject_ref.current = next_subject;
      set_translated_subject(next_subject);
    },
    [account_id, email_id, subject, abort_active],
  );

  const run_detection = useCallback(
    (body: HTMLElement) => {
      const {
        mode: current_mode,
        configured_accepted: current_configured,
        never_languages: current_never,
        target_language: current_target,
      } = config_ref.current;

      const decision = decide_translation({
        mode: current_mode,
        translatable,
        message_id: email_id,
        body_text: read_body_text(body),
        target: current_target,
        configured_accepted: current_configured,
        never_languages: current_never,
      });

      if (decision.kind === "idle") {
        source_ref.current = null;
        set_source_language(null);
        set_status("idle");

        return;
      }

      source_ref.current = decision.language;
      set_source_language(decision.language);

      if (decision.kind === "translate") {
        void run_translation(decision.language);
      } else {
        set_status("offer");
      }
    },
    [email_id, translatable, run_translation],
  );

  const on_document_ready = useCallback(
    (body: HTMLElement, request_remeasure: () => void) => {
      target_ref.current = { body, remeasure: request_remeasure };

      run_detection(body);

      return () => {
        abort_active();

        if (target_ref.current?.body === body) {
          target_ref.current = null;
        }
      };
    },
    [run_detection, abort_active],
  );

  const revoke_translation = useCallback(() => {
    const render = target_ref.current;

    abort_active();

    if (render && !showing_original_ref.current) {
      restore_originals(render.body);
      render.remeasure();
    }

    source_ref.current = null;
    last_translated_subject_ref.current = null;
    set_source_language(null);
    set_showing_original(false);
    set_translated_subject(null);
    set_status("idle");
  }, [abort_active]);

  useEffect(() => {
    const render = target_ref.current;

    if (!render) return;

    const current_status = status_ref.current;

    if (current_status === "translating" || current_status === "translated") {
      const {
        mode: current_mode,
        target_language: current_target,
        configured_accepted: current_configured,
        never_languages: current_never,
      } = config_ref.current;

      const keep = should_keep_translation({
        mode: current_mode,
        translatable,
        source: source_ref.current,
        target: current_target,
        configured_accepted: current_configured,
        never_languages: current_never,
      });

      if (!keep) revoke_translation();

      return;
    }

    run_detection(render.body);
  }, [
    mode,
    configured_accepted,
    never_languages,
    translatable,
    run_detection,
    revoke_translation,
  ]);

  const translate = useCallback(() => {
    const from = source_ref.current;

    if (from) void run_translation(from);
  }, [run_translation]);

  const show_original = useCallback(() => {
    const render = target_ref.current;

    if (!render) return;

    if (showing_original) {
      restore_translated(render.body);
      mark_translated(render.body, config_ref.current.target_language);
      set_showing_original(false);
      set_translated_subject(last_translated_subject_ref.current);
      animate_body_swap(render.body, render.remeasure);

      return;
    }

    restore_originals(render.body);
    set_showing_original(true);
    set_translated_subject(null);
    animate_body_swap(render.body, render.remeasure);
  }, [showing_original]);

  return {
    status,
    source_language,
    target_language,
    limited_quality: source_language ? has_limited_quality(source_language) : false,
    showing_original,
    translated_subject,
    translate,
    show_original,
    on_document_ready,
  };
}
