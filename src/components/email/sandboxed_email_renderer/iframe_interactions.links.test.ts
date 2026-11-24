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
import { afterEach, describe, expect, it, vi } from "vitest";

const open_external_mock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/open_link", () => ({ open_external: open_external_mock }));

import { attach_iframe_interactions } from "./iframe_interactions";

import type { MailtoDraft } from "@/lib/mailto_link";

import {
  reset_mailto_bridge,
  subscribe_mailto_drafts,
} from "@/native/desktop_mailto_bridge";

function mount_message(body_html: string): Document {
  const iframe = document.createElement("iframe");

  document.body.appendChild(iframe);

  const frame_doc = document.implementation.createHTMLDocument("message");

  frame_doc.body.innerHTML = body_html;
  attach_iframe_interactions(iframe, frame_doc, frame_doc.body, () => {}, {
    current: null,
  });

  return frame_doc;
}

function click(element: Element): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
  });

  element.dispatchEvent(event);

  return event;
}

afterEach(() => {
  reset_mailto_bridge();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("mail links inside a message", () => {
  it("opens the in-app composer without blind copies", () => {
    const drafts: MailtoDraft[] = [];
    const external = vi.fn();

    subscribe_mailto_drafts((draft) => drafts.push(draft));
    window.addEventListener("aster-external-link", external);

    const frame_doc = mount_message(
      '<a id="l" href="mailto:ada@example.com?cc=grace@example.com&bcc=ken@example.com&BCC=rob@example.com&subject=Hi&body=Hello">Write</a>',
    );
    const event = click(frame_doc.getElementById("l")!);

    window.removeEventListener("aster-external-link", external);

    expect(event.defaultPrevented).toBe(true);
    expect(external).not.toHaveBeenCalled();
    expect(drafts).toEqual([
      {
        to: ["ada@example.com"],
        cc: ["grace@example.com"],
        bcc: [],
        subject: "Hi",
        body: "Hello",
      },
    ]);
  });

  it("sends the link through the external link gate without blind copies when no composer is listening", () => {
    const urls: string[] = [];
    const external = (event: Event) => {
      urls.push((event as CustomEvent<{ url: string }>).detail.url);
    };

    open_external_mock.mockClear();
    window.addEventListener("aster-external-link", external);

    const frame_doc = mount_message(
      '<a id="l" href="mailto:ada@example.com?bcc=ken@example.com&subject=Hi;attach=/etc/passwd&attachment=x">Write</a>',
    );
    const event = click(frame_doc.getElementById("l")!);

    window.removeEventListener("aster-external-link", external);

    expect(event.defaultPrevented).toBe(true);
    expect(open_external_mock).not.toHaveBeenCalled();
    expect(urls).toEqual(["mailto:ada@example.com?subject=Hi"]);
  });

  it("does not open the system mail app when the in-app composer takes the link", () => {
    const external = vi.fn();

    open_external_mock.mockClear();
    subscribe_mailto_drafts(() => {});
    window.addEventListener("aster-external-link", external);

    const frame_doc = mount_message(
      '<a id="l" href="mailto:ada@example.com">Write</a>',
    );
    const event = click(frame_doc.getElementById("l")!);

    window.removeEventListener("aster-external-link", external);

    expect(event.defaultPrevented).toBe(true);
    expect(open_external_mock).not.toHaveBeenCalled();
    expect(external).not.toHaveBeenCalled();
  });
});

describe("fragment links inside a message", () => {
  it("scrolls to the named anchor instead of navigating the frame", () => {
    const frame_doc = mount_message(
      '<a id="jump" href="  #part-2">Jump</a><p>Gap</p><a name="part-2">Part</a>',
    );
    const destination = frame_doc.querySelector('[name="part-2"]')!;
    const scroll = vi.fn();

    (destination as HTMLElement).scrollIntoView = scroll;

    const event = click(frame_doc.getElementById("jump")!);

    expect(event.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("finds an anchor that carries the in-document prefix", () => {
    const frame_doc = mount_message(
      '<a id="jump" href="#part-2">Jump</a><a name="aster_anchor_part-2">Part</a>',
    );
    const destination = frame_doc.querySelector(
      '[name="aster_anchor_part-2"]',
    )!;
    const scroll = vi.fn();

    (destination as HTMLElement).scrollIntoView = scroll;

    const event = click(frame_doc.getElementById("jump")!);

    expect(event.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("handles fragment links on image map areas", () => {
    const frame_doc = mount_message(
      '<map name="m"><area id="spot" href="#end" shape="rect" coords="0,0,1,1"></map><div id="end">End</div>',
    );
    const destination = frame_doc.getElementById("end")!;
    const scroll = vi.fn();
    const external = vi.fn();

    destination.scrollIntoView = scroll;
    window.addEventListener("aster-external-link", external);

    const event = click(frame_doc.getElementById("spot")!);

    window.removeEventListener("aster-external-link", external);

    expect(event.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(external).not.toHaveBeenCalled();
  });

  it("does nothing for a fragment with no destination", () => {
    const frame_doc = mount_message('<a id="jump" href="#">Top</a>');
    const event = click(frame_doc.getElementById("jump")!);

    expect(event.defaultPrevented).toBe(true);
  });
});
