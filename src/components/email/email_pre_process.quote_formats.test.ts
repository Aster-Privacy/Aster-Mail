import { describe, expect, it } from "vitest";

import { pre_process_email_html } from "./email_pre_process";

import { is_html_content, plain_text_to_html } from "@/lib/html_text";

const options = {
  forwarded_label: "Forwarded message",
  show_trimmed_label: "Show trimmed content",
  preserve_formatting: false,
  load_remote_content: false,
  proxy_base: "",
};

function render_html(html: string): Document {
  const out = pre_process_email_html(html, options);

  return new DOMParser().parseFromString(out, "text/html");
}

function render_plain(text: string): Document {
  return render_html(plain_text_to_html(text));
}

function visible_text(doc: Document): string {
  const clone = doc.body.cloneNode(true) as HTMLElement;

  clone.querySelectorAll(".aster-quoted-content").forEach((el) => el.remove());

  return clone.textContent || "";
}

function hidden_text(doc: Document): string {
  return Array.from(doc.querySelectorAll(".aster-quoted-content"))
    .map((el) => el.textContent || "")
    .join("\n");
}

const localized = [
  ["de", "Am 07.10.2026 um 14:03 schrieb Max Muster <max@example.de>:"],
  [
    "fr",
    "Le mer. 7 oct. 2026 à 14:03, Jean Dupont <jean@example.fr> a écrit :",
  ],
  ["es", "El mié, 7 oct 2026 a las 14:03, Ana <ana@example.es> escribió:"],
  [
    "it",
    "Il giorno mer 7 ott 2026 alle ore 14:03 Luca <luca@example.it> ha scritto:",
  ],
  ["pt", "Em qua., 7 de out. de 2026 às 14:03, Rui <rui@example.pt> escreveu:"],
  ["nl", "Op wo 7 okt 2026 om 14:03 schreef Jan <jan@example.nl>:"],
  ["sv", "Den ons 7 okt. 2026 kl 14:03 skrev Erik <erik@example.se>:"],
  ["pl", "W dniu 7.10.2026 o 14:03, Jan Kowalski <jan@example.pl> pisze:"],
  ["ru", "7 окт. 2026 г., в 14:03, Иван <ivan@example.ru> написал(а):"],
  ["zh", "Li <li@example.cn> 于2026年10月7日周三 14:03写道："],
  ["ko", "2026년 10월 7일 (수) 오후 2:03, Kim <kim@example.kr>님이 작성:"],
];

describe("localized attributions", () => {
  for (const [lang, line] of localized) {
    it(`collapses a ${lang} quote`, () => {
      const doc = render_plain(
        ["Reply body here.", "", line, "> earlier text", "> more"].join("\n"),
      );

      expect(visible_text(doc)).toContain("Reply body here.");
      expect(visible_text(doc)).not.toContain("earlier text");
      expect(hidden_text(doc)).toContain("earlier text");
    });
  }

  it("collapses a localized HTML attribution with a blockquote", () => {
    const doc = render_html(
      '<div>Danke!</div><div class="x">Am 07.10.2026 um 14:03 schrieb Max &lt;max@example.de&gt;:<br></div><blockquote>alt</blockquote>',
    );

    expect(visible_text(doc)).toContain("Danke!");
    expect(visible_text(doc)).not.toContain("alt");
  });
});

describe("header block quotes", () => {
  it("collapses an HTML header block after a rule", () => {
    const doc = render_html(
      [
        "<div>Thanks, see attached.</div>",
        '<div id="appendonsend"></div>',
        '<hr style="display:inline-block;width:98%">',
        '<div id="divRplyFwdMsg" dir="ltr"><font face="Calibri"><b>From:</b> Someone &lt;a@example.com&gt;<br>',
        "<b>Sent:</b> Wednesday, October 7, 2026 2:03 PM<br>",
        "<b>To:</b> Me &lt;b@example.com&gt;<br>",
        "<b>Subject:</b> Re: plans</font><div>&nbsp;</div></div>",
        "<div>earlier body text</div>",
      ].join(""),
    );

    expect(visible_text(doc)).toContain("Thanks, see attached.");
    expect(visible_text(doc)).not.toContain("earlier body text");
    expect(visible_text(doc)).not.toContain("Subject:");
    expect(doc.querySelectorAll("hr").length).toBe(
      doc.querySelectorAll(".aster-quoted-content hr").length,
    );
  });

  it("collapses a word-style header block with a top border", () => {
    const doc = render_html(
      [
        '<div class="WordSection1"><p class="MsoNormal">Approved.<o:p></o:p></p>',
        '<div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0in 0in 0in">',
        '<p class="MsoNormal"><b>From:</b> Someone &lt;a@example.com&gt;<br><b>Sent:</b> Tuesday, October 6, 2026 9:00 AM<br><b>To:</b> Me<br><b>Subject:</b> Budget<o:p></o:p></p></div>',
        '<p class="MsoNormal">older request<o:p></o:p></p></div>',
      ].join(""),
    );

    expect(visible_text(doc)).toContain("Approved.");
    expect(visible_text(doc)).not.toContain("older request");
  });

  it("collapses a plain-text header block under a separator", () => {
    const doc = render_plain(
      [
        "Confirmed for Friday.",
        "",
        "________________________________",
        "From: Someone <a@example.com>",
        "Sent: Tuesday, October 6, 2026 9:00 AM",
        "To: Me <b@example.com>",
        "Subject: Friday",
        "",
        "older request",
      ].join("\n"),
    );

    expect(visible_text(doc)).toContain("Confirmed for Friday.");
    expect(visible_text(doc)).not.toContain("older request");
    expect(visible_text(doc)).not.toContain("____");
  });

  it("collapses a German header block", () => {
    const doc = render_plain(
      [
        "Passt.",
        "",
        "Von: Max <max@example.de>",
        "Gesendet: Dienstag, 6. Oktober 2026 09:00",
        "An: Ich",
        "Betreff: Termin",
        "",
        "alte Nachricht",
      ].join("\n"),
    );

    expect(visible_text(doc)).toContain("Passt.");
    expect(visible_text(doc)).not.toContain("alte Nachricht");
  });

  it("ignores a lone From line in the reply", () => {
    const doc = render_plain(
      "From: the team, with thanks.\nSee you soon.\nSubject to change.",
    );

    expect(doc.querySelector(".aster-quoted-content")).toBeNull();
  });
});

describe("reply layouts", () => {
  it("keeps interleaved inline replies visible", () => {
    const doc = render_plain(
      [
        "Answers inline.",
        "",
        "On Tue, Oct 6, 2026 at 9:00 AM Someone <a@example.com> wrote:",
        "> Can you make Friday?",
        "",
        "Yes, Friday works.",
        "",
        "> And bring the slides?",
        "",
        "Will do.",
      ].join("\n"),
    );

    expect(doc.querySelector(".aster-quoted-content")).toBeNull();
    expect(visible_text(doc)).toContain("Yes, Friday works.");
    expect(visible_text(doc)).toContain("Will do.");
    expect(visible_text(doc)).toContain("And bring the slides?");
  });

  it("keeps a bottom-posted reply visible below the toggle", () => {
    const doc = render_plain(
      [
        "On Tue, Oct 6, 2026 at 9:00 AM Someone <a@example.com> wrote:",
        "> Can you make Friday?",
        "> Let me know.",
        "",
        "Yes, Friday works.",
      ].join("\n"),
    );

    expect(visible_text(doc)).toContain("Yes, Friday works.");
    expect(visible_text(doc)).not.toContain("Can you make Friday?");

    const toggle = doc.querySelector(".aster-quote-toggle")!;
    const reply = Array.from(doc.querySelectorAll("p")).find((p) =>
      (p.textContent || "").includes("Yes, Friday"),
    )!;

    expect(
      toggle.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the signature after a quote visible", () => {
    const doc = render_plain(
      [
        "Sounds good.",
        "",
        "On Tue, Oct 6, 2026 at 9:00 AM Someone <a@example.com> wrote:",
        "> earlier text",
        "",
        "-- ",
        "Jordan, Example Inc.",
      ].join("\n"),
    );

    expect(visible_text(doc)).toContain("Sounds good.");
    expect(visible_text(doc)).toContain("Jordan, Example Inc.");
    expect(visible_text(doc)).not.toContain("earlier text");
  });

  it("collapses a trailing quote run with no attribution", () => {
    const doc = render_plain(
      ["Agreed.", "", "> earlier one", "> earlier two"].join("\n"),
    );

    expect(visible_text(doc)).toContain("Agreed.");
    expect(visible_text(doc)).not.toContain("earlier one");
  });

  it("collapses a nested attribution inside a wrapper", () => {
    const doc = render_html(
      '<div dir="ltr"><div>Top reply.</div><div><br></div><div class="q"><div>On Tue, Oct 6, 2026 at 9:00 AM Someone &lt;a@example.com&gt; wrote:<br></div><blockquote>older</blockquote></div></div>',
    );

    expect(visible_text(doc)).toContain("Top reply.");
    expect(visible_text(doc)).not.toContain("older");
  });

  it("does not treat a sentence ending in wrote as an attribution", () => {
    const doc = render_plain(
      "Based on what you wrote:\nthe plan is fine.\nOne more thing.",
    );

    expect(doc.querySelector(".aster-quoted-content")).toBeNull();
  });

  it("does not fold a sentence that starts with On", () => {
    const doc = render_plain(
      "On reflection, I agree.\nWe should ship it.\nThanks.",
    );

    expect(doc.querySelector(".aster-quoted-content")).toBeNull();
  });

  it("is idempotent", () => {
    const text = [
      "Reply.",
      "",
      "On Tue, Oct 6, 2026 at 9:00 AM Someone <a@example.com> wrote:",
      "> earlier",
    ].join("\n");
    const once = pre_process_email_html(plain_text_to_html(text), options);
    const twice = pre_process_email_html(once, options);
    const doc = new DOMParser().parseFromString(twice, "text/html");

    expect(doc.querySelectorAll(".aster-quote-toggle").length).toBe(1);
    expect(visible_text(doc)).toContain("Reply.");
  });
});

describe("plain text classification", () => {
  it("treats a bracketed display name as plain text", () => {
    expect(is_html_content("Reply to <john smith> soon")).toBe(false);
    expect(is_html_content("<a@b.com> wrote")).toBe(false);
    expect(is_html_content("x <section 3> y")).toBe(true);
  });

  it("recognizes numeric entities and common markup", () => {
    expect(is_html_content("caf&#233;")).toBe(true);
    expect(is_html_content("&#x2019;")).toBe(true);
    expect(is_html_content("<table><tr><td>a</td></tr></table>")).toBe(true);
  });
});
