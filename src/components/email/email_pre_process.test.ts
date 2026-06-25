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
import { describe, expect, it } from "vitest";

import { pre_process_email_html, type PreProcessOptions } from "./email_pre_process";

const options: PreProcessOptions = {
  forwarded_label: "Forwarded message",
  show_trimmed_label: "Show trimmed content",
  preserve_formatting: false,
  load_remote_content: false,
  proxy_base: "https://proxy.example/img",
};

describe("pre_process_email_html forwarded gmail_quote", () => {
  it("does not collapse the body when the gmail_quote is the entire message", () => {
    const html = `<div dir="ltr"><br></div><div class="gmail_quote">---------- Forwarded message ---------<br>From: Someone &lt;a@b.com&gt;<br><br><div>The actual forwarded text that must stay visible.</div></div>`;

    const out = pre_process_email_html(html, options);

    expect(out).toContain("The actual forwarded text that must stay visible.");
    expect(out).not.toContain("aster-quote-toggle");
    expect(out).not.toContain("display:none");
  });

  it("does not collapse when an aster_quote forward is the entire message", () => {
    const html = `<div class="aster_quote">---------- Forwarded message ---------<br><div>In-app forwarded body that must stay visible.</div></div>`;

    const out = pre_process_email_html(html, options);

    expect(out).toContain("In-app forwarded body that must stay visible.");
    expect(out).not.toContain("aster-quote-toggle");
    expect(out).not.toContain("display:none");
  });

  it("auto-expands a plain-text forward that is the entire message", () => {
    const html = `<div>---------- Forwarded message ---------<br>From: Someone &lt;a@b.com&gt;<br>Subject: Hi<br>The plain forwarded body.</div>`;

    const out = pre_process_email_html(html, options);

    expect(out).toContain("aster-forwarded-collapse");
    expect(out).toMatch(/<details[^>]*\bopen\b/);
    expect(out).toContain("The plain forwarded body.");
  });

  it("keeps a plain-text forward collapsed when the user wrote a note above it", () => {
    const html = `<div>See the message below.</div><div>---------- Forwarded message ---------<br>From: Someone &lt;a@b.com&gt;<br>Subject: Hi</div>`;

    const out = pre_process_email_html(html, options);

    expect(out).toContain("See the message below.");
    expect(out).toContain("aster-forwarded-collapse");
    expect(out).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it("does not blank the body for a reply that is only a quoted history", () => {
    const html = `<div>On Mon, Jan 1, 2026 at 9:00 AM Someone &lt;a@b.com&gt; wrote:</div><blockquote>The entire prior conversation lives here.</blockquote>`;

    const out = pre_process_email_html(html, options);

    expect(out).toContain("The entire prior conversation lives here.");
    expect(out).not.toContain('style="display:none"');
  });

  it("still collapses quoted history when there is a real reply above it", () => {
    const html = `<div>Thanks, that works for me.</div><div>On Mon, Jan 1, 2026 at 9:00 AM Someone &lt;a@b.com&gt; wrote:</div><blockquote>Old thread content.</blockquote>`;

    const out = pre_process_email_html(html, options);

    expect(out).toContain("Thanks, that works for me.");
    expect(out).toContain("aster-quote-toggle");
    expect(out).toContain('style="display:none"');
  });

  it("still collapses the gmail_quote when the user added a note above it", () => {
    const html = `<div dir="ltr">Here you go, see below.</div><div class="gmail_quote">---------- Forwarded message ---------<br><div>Quoted history.</div></div>`;

    const out = pre_process_email_html(html, options);

    expect(out).toContain("Here you go, see below.");
    expect(out).toContain("aster-quote-toggle");
    expect(out).toContain("aster-quoted-content");
  });
});
