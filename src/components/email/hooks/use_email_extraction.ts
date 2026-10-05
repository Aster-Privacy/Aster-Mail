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
import type { EmailExtractionResult } from "@/services/extraction/types";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  extract_email_details,
  extraction_needs_markup_parse,
} from "@/services/extraction/extractor";
import { run_after_next_paint } from "@/lib/run_after_next_paint";
import { guard_body_step } from "@/components/email/message_body_fallback";

function no_extracted_details(): EmailExtractionResult {
  return {
    has_purchase_details: false,
    has_shipping_details: false,
    purchase: null,
    shipping: null,
    extracted_at: Date.now(),
  };
}

interface ExtractionJob {
  ready?: EmailExtractionResult;
  run?: () => EmailExtractionResult;
}

export interface EmailExtractionSource {
  email_id: string;
  subject: string;
  body_text: string;
  body_html: string | undefined;
  from_email: string;
  from_name: string;
}

export function use_email_extraction(
  source: EmailExtractionSource | null,
): EmailExtractionResult | null {
  const email_id = source?.email_id ?? null;
  const subject = source?.subject ?? "";
  const body_text = source?.body_text ?? "";
  const body_html = source?.body_html;
  const from_email = source?.from_email ?? "";
  const from_name = source?.from_name ?? "";

  const job = useMemo((): ExtractionJob | null => {
    if (email_id === null) return null;

    const run = () =>
      guard_body_step(
        "components/email/hooks/use_email_extraction:extract",
        () =>
          extract_email_details(
            subject,
            body_text,
            body_html,
            from_email,
            from_name,
          ),
        no_extracted_details,
      );

    if (!extraction_needs_markup_parse(body_text, body_html)) {
      return { ready: run() };
    }

    return { run };
  }, [email_id, subject, body_text, body_html, from_email, from_name]);

  const [deferred, set_deferred] = useState<{
    job: ExtractionJob;
    result: EmailExtractionResult;
  } | null>(null);
  const shown_email_ref = useRef<string | null>(null);

  const result = useMemo((): EmailExtractionResult | null => {
    if (!job) return null;
    if (job.ready) return job.ready;
    if (deferred?.job === job) return deferred.result;
    if (shown_email_ref.current === email_id) return job.run!();

    return null;
  }, [job, deferred, email_id]);

  const is_pending = job !== null && result === null;

  useEffect(() => {
    if (!is_pending || !job?.run) return;
    const run = job.run;

    return run_after_next_paint(() => {
      set_deferred({ job, result: run() });
    });
  }, [is_pending, job]);

  if (result && email_id !== null) {
    shown_email_ref.current = email_id;
  }

  return result;
}
