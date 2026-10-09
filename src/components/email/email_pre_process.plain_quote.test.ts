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

const plain_reply = [
  "Of course and done :)",
  "",
  "Cheers,",
  ".mario",
  "",
  "On 10/8/26 04:00, Aster Team wrote:",
  "> Received! Looking forward to talking then.",
  ">",
  "> Would you also be able to invite my co-founder to the meeting as well?",
  "> This is his email: someone@example.com",
  "> <mailto:someone@example.com>",
  ">",
  "> Thanks,",
  "> Athanasios",
  ">",
  "> On Wed, Oct 7, 2026, 3:16 AM, Dr.-Ing. Mario Heiderich <mario@example.de>",
  "> wrote:",
  ">",
  ">     Hi Athanasios,",
  "",
].join("\r\n");

function render(text: string): Document {
  const out = pre_process_email_html(plain_text_to_html(text), options);

  return new DOMParser().parseFromString(out, "text/html");
}

function visible_text(doc: Document): string {
  const clone = doc.body.cloneNode(true) as HTMLElement;

  clone.querySelectorAll(".aster-quoted-content").forEach((el) => el.remove());

  return clone.textContent || "";
}

describe("plain text detection", () => {
  it("treats angle-bracket addresses and links as plain text", () => {
    expect(is_html_content(plain_reply)).toBe(false);
    expect(is_html_content("Mario <mario@example.de> wrote")).toBe(false);
    expect(is_html_content("see <https://example.com/a?b=1>")).toBe(false);
    expect(is_html_content("a < b and c > d")).toBe(false);
  });

  it("still recognizes real markup", () => {
    expect(is_html_content("<p>hi</p>")).toBe(true);
    expect(is_html_content("hi<br>there")).toBe(true);
    expect(is_html_content("hi<br/>there")).toBe(true);
    expect(is_html_content('<a href="https://example.com">x</a>')).toBe(true);
    expect(is_html_content("<!DOCTYPE html><html></html>")).toBe(true);
    expect(is_html_content('<div\nclass="x">y</div>')).toBe(true);
    expect(is_html_content("<o:p></o:p>")).toBe(true);
    expect(is_html_content("fish &amp; chips")).toBe(true);
  });
});

describe("plain text quoted replies", () => {
  it("collapses the quoted history below the reply", () => {
    const doc = render(plain_reply);
    const hidden = doc.querySelector(".aster-quoted-content");

    expect(hidden).not.toBeNull();
    expect(hidden!.textContent).toContain("Received! Looking forward");
    expect(visible_text(doc)).toContain("Of course and done");
    expect(visible_text(doc)).toContain(".mario");
    expect(visible_text(doc)).not.toContain("Received!");
  });

  it("collapses a quote that shares a paragraph with the reply", () => {
    const doc = render(
      [
        "Sounds good.",
        "Thanks",
        "On Tue, Oct 6, 2026 at 2:59 AM Someone <a@example.com> wrote:",
        "> earlier text",
        "> more earlier text",
      ].join("\n"),
    );

    expect(visible_text(doc)).toContain("Sounds good.");
    expect(visible_text(doc)).toContain("Thanks");
    expect(visible_text(doc)).not.toContain("earlier text");
    expect(visible_text(doc)).not.toContain("wrote:");
  });

  it("collapses an attribution wrapped onto a second line", () => {
    const doc = render(
      [
        "Works for me.",
        "",
        "On Wed, Oct 7, 2026, 3:16 AM, Dr.-Ing. Someone Long <a@example.com>",
        "wrote:",
        "> earlier text",
      ].join("\n"),
    );

    expect(visible_text(doc)).toContain("Works for me.");
    expect(visible_text(doc)).not.toContain("earlier text");
    expect(visible_text(doc)).not.toContain("wrote:");
  });

  it("leaves a message with no reply text expanded", () => {
    const doc = render("On Mon, Oct 5, 2026 Someone wrote:\n> only quote");

    expect(doc.querySelector(".aster-quoted-content")).toBeNull();
    expect(doc.body.textContent).toContain("only quote");
  });
});
