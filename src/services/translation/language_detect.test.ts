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
import type { LanguageCode } from "./engine_types";

import { beforeEach, describe, expect, it } from "vitest";

import {
  clear_detection_cache,
  decide_translation,
  detect_language,
  detect_translatable_language,
  MIN_DETECTION_CONFIDENCE,
  should_keep_translation,
  strip_for_detection,
} from "./language_detect";

const SAMPLES: ReadonlyArray<[string, string]> = [
  [
    "de",
    "Guten Tag, wir haben Ihre Bestellung erhalten und werden sie in den nächsten Tagen versenden. Bitte beachten Sie die beigefügte Rechnung.",
  ],
  [
    "fr",
    "Bonjour, nous avons bien reçu votre commande et nous vous remercions pour votre confiance. Vous trouverez la facture dans les pièces jointes.",
  ],
  [
    "es",
    "Hola, hemos recibido su pedido y le agradecemos su confianza. Puede consultar la factura que se adjunta con este mensaje para más detalles.",
  ],
  [
    "pt",
    "Olá, recebemos o seu pedido e agradecemos a sua confiança. Você pode consultar a fatura anexada a esta mensagem para obter mais detalhes.",
  ],
  [
    "it",
    "Buongiorno, abbiamo ricevuto il suo ordine e la ringraziamo per la fiducia. Nella fattura allegata a questo messaggio trova tutti i dettagli.",
  ],
  [
    "nl",
    "Goedendag, wij hebben uw bestelling ontvangen en danken u voor het vertrouwen. In de bijgevoegde factuur vindt u alle details van deze aankoop.",
  ],
  [
    "en",
    "Hello, we have received your order and we will ship it in the next few days. Please review the attached invoice for the full details of this purchase.",
  ],
  [
    "ru",
    "Здравствуйте, мы получили ваш заказ и отправим его в ближайшие дни. Пожалуйста, ознакомьтесь с приложенным счетом.",
  ],
  [
    "ar",
    "مرحبا، لقد تلقينا طلبك وسنقوم بشحنه في الأيام القليلة القادمة. يرجى الاطلاع على الفاتورة المرفقة بهذه الرسالة.",
  ],
  [
    "ja",
    "こんにちは、ご注文を承りました。数日以内に発送いたしますので、添付の請求書をご確認ください。よろしくお願いいたします。",
  ],
  [
    "ko",
    "안녕하세요, 주문이 접수되었습니다. 며칠 안에 발송할 예정이오니 첨부된 청구서를 확인해 주시기 바랍니다. 감사합니다.",
  ],
  [
    "zh",
    "您好，我们已收到您的订单，将在几天内发货。请查看随附的发票以了解详细信息，感谢您的支持。",
  ],
];

describe("detect_language", () => {
  beforeEach(() => {
    clear_detection_cache();
  });

  for (const [language, text] of SAMPLES) {
    it(`identifies ${language} with usable confidence`, () => {
      const result = detect_language(text);

      expect(result?.language).toBe(language);
      expect(result?.confidence).toBeGreaterThanOrEqual(
        MIN_DETECTION_CONFIDENCE,
      );
    });
  }

  it("returns nothing for text below the length gate", () => {
    expect(detect_language("Guten Tag")).toBeNull();
  });

  it("detects the primary language despite a trailing english footer", () => {
    const french =
      "Bonjour, decouvrez nos nouvelles offres pour cette semaine. Profitez de la livraison gratuite sur toutes vos commandes. Shop now. Best deals of the week. Merci de votre confiance et a bientot.";

    const result = detect_language(french);

    expect(result?.language).toBe("fr");
    expect(result?.confidence).toBeGreaterThanOrEqual(MIN_DETECTION_CONFIDENCE);
  });

  it("detects a foreign body interleaved with english calls to action", () => {
    const spanish =
      "Hola, tu pedido ha sido enviado y llegara pronto a tu casa. Gracias por tu compra con nosotros. Track your order here. Download our app today.";

    const result = detect_language(spanish);

    expect(result?.language).toBe("es");
    expect(result?.confidence).toBeGreaterThanOrEqual(MIN_DETECTION_CONFIDENCE);
  });

  it("stays below the gate for an even multilingual jumble", () => {
    const jumble = "und les der des die une das vous ein pour mit dans";

    expect(detect_language(jumble)?.confidence).toBeLessThan(
      MIN_DETECTION_CONFIDENCE,
    );
  });

  it("returns nothing when only urls and addresses remain", () => {
    const text =
      "https://example.com/a/b/c/d/e/f support@example.com https://example.org/x";

    expect(detect_language(text)).toBeNull();
  });

  it("strips quoted lines and signatures before detecting", () => {
    const stripped = strip_for_detection(
      "Bonjour tout le monde\n> ceci est une citation\n--\nma signature",
    );

    expect(stripped).not.toContain("citation");
    expect(stripped).not.toContain("signature");
  });
});

describe("detect_translatable_language", () => {
  beforeEach(() => {
    clear_detection_cache();
  });

  const german = SAMPLES[0][1];

  it("offers a language the reader has not accepted", () => {
    expect(detect_translatable_language("m1", german, ["en"])?.language).toBe(
      "de",
    );
  });

  it("stays silent for a language the reader already accepts", () => {
    expect(detect_translatable_language("m1", german, ["en", "de"])).toBeNull();
  });

  it("caches a negative result for the same message and accepted set", () => {
    expect(detect_translatable_language("m2", german, ["en", "de"])).toBeNull();
    expect(detect_translatable_language("m2", german, ["en", "de"])).toBeNull();
  });

  it("does not poison the cache when the first body is too short to judge", () => {
    expect(detect_translatable_language("m2b", "zu kurz", ["en"])).toBeNull();
    expect(detect_translatable_language("m2b", german, ["en"])?.language).toBe(
      "de",
    );
  });

  it("does not let a negative result leak across accepted sets", () => {
    expect(detect_translatable_language("m3", "zu kurz", ["en"])).toBeNull();
    expect(detect_translatable_language("m3", german, ["fr"])?.language).toBe(
      "de",
    );
  });

  it("stays silent when detection confidence is below the gate", () => {
    const ambiguous = "und les der des die une das vous ein pour mit dans";
    const raw = detect_language(ambiguous);

    expect(raw).not.toBeNull();
    expect(raw!.confidence).toBeLessThan(MIN_DETECTION_CONFIDENCE);
    expect(detect_translatable_language("m4", ambiguous, ["en"])).toBeNull();
  });
});

describe("decide_translation", () => {
  beforeEach(() => {
    clear_detection_cache();
  });

  const german = SAMPLES[0][1];
  const no_never: ReadonlySet<LanguageCode> = new Set();

  const base = {
    message_id: "d1",
    body_text: german,
    target: "en" as LanguageCode,
    configured_accepted: [] as LanguageCode[],
    never_languages: no_never,
  };

  it("offers in ask mode when only implicit browser languages would suppress it", () => {
    const decision = decide_translation({
      ...base,
      mode: "ask",
      translatable: true,
    });

    expect(decision).toEqual({ kind: "offer", language: "de" });
  });

  it("auto-translates in always mode for the same message", () => {
    const decision = decide_translation({
      ...base,
      mode: "always",
      translatable: true,
    });

    expect(decision).toEqual({ kind: "translate", language: "de" });
  });

  it("treats ask and always identically for what counts as translatable", () => {
    const ask = decide_translation({
      ...base,
      mode: "ask",
      translatable: true,
    });

    clear_detection_cache();

    const always = decide_translation({
      ...base,
      mode: "always",
      translatable: true,
    });

    expect(ask.kind).toBe("offer");
    expect(always.kind).toBe("translate");
    expect(ask.kind === "offer" ? ask.language : null).toBe(
      always.kind === "translate" ? always.language : "x",
    );
  });

  it("suppresses a read language in ask mode but still translates it in always mode", () => {
    const configured = ["de"] as LanguageCode[];

    expect(
      decide_translation({
        ...base,
        mode: "ask",
        translatable: true,
        configured_accepted: configured,
      }),
    ).toEqual({ kind: "idle" });

    clear_detection_cache();

    expect(
      decide_translation({
        ...base,
        mode: "always",
        translatable: true,
        configured_accepted: configured,
      }),
    ).toEqual({ kind: "translate", language: "de" });
  });

  it("keeps a read language untouched in always mode when it is also on the never list", () => {
    expect(
      decide_translation({
        ...base,
        mode: "always",
        translatable: true,
        configured_accepted: ["de"] as LanguageCode[],
        never_languages: new Set<LanguageCode>(["de"]),
      }),
    ).toEqual({ kind: "idle" });
  });

  it("never offers a language on the never list", () => {
    expect(
      decide_translation({
        ...base,
        mode: "ask",
        translatable: true,
        never_languages: new Set<LanguageCode>(["de"]),
      }),
    ).toEqual({ kind: "idle" });
  });

  it("stays idle when the mode is off or the message is not translatable", () => {
    expect(
      decide_translation({ ...base, mode: "off", translatable: true }),
    ).toEqual({ kind: "idle" });
    expect(
      decide_translation({ ...base, mode: "always", translatable: false }),
    ).toEqual({ kind: "idle" });
  });
});

describe("should_keep_translation", () => {
  const keep_base = {
    mode: "always" as const,
    translatable: true,
    source: "de" as LanguageCode,
    target: "en" as LanguageCode,
    configured_accepted: [] as LanguageCode[],
    never_languages: new Set<LanguageCode>(),
  };

  it("keeps an active translation while its preconditions still hold", () => {
    expect(should_keep_translation(keep_base)).toBe(true);
  });

  it("revokes when the mode flips to off", () => {
    expect(should_keep_translation({ ...keep_base, mode: "off" })).toBe(false);
  });

  it("revokes when the source language is added to the never list", () => {
    expect(
      should_keep_translation({
        ...keep_base,
        never_languages: new Set<LanguageCode>(["de"]),
      }),
    ).toBe(false);
  });

  it("keeps a read language translated in always mode", () => {
    expect(
      should_keep_translation({
        ...keep_base,
        configured_accepted: ["de"],
      }),
    ).toBe(true);
  });

  it("revokes a read language in ask mode", () => {
    expect(
      should_keep_translation({
        ...keep_base,
        mode: "ask",
        configured_accepted: ["de"],
      }),
    ).toBe(false);
  });

  it("revokes when the render is no longer translatable", () => {
    expect(should_keep_translation({ ...keep_base, translatable: false })).toBe(
      false,
    );
  });

  it("revokes when there is no detected source", () => {
    expect(should_keep_translation({ ...keep_base, source: null })).toBe(false);
  });
});

describe("single stopword false positives", () => {
  beforeEach(() => {
    clear_detection_cache();
  });

  it("does not call an English message Spanish because of a surname", () => {
    const text =
      "Hello,\nYES! It works without errors now, thanks a lot!\n\nBest regards,\nBruno Del Frate";

    expect(detect_language(text)).toBeNull();
  });

  it("does not call an English message Dutch because of a surname", () => {
    const text =
      "Hi there, quick update: the report is ready and I will send it over shortly.\n\nRegards,\nJan Van Dijk";

    expect(detect_language(text)?.language).not.toBe("nl");
  });

  it("does not call an English message Italian because of the word per", () => {
    const text =
      "Unfortunately, still same result.\nFile version 1.4.59 as per windows properties of downloaded file.\n\nSecured by Aster Mail";

    expect(detect_language(text)).toBeNull();
  });

  it("still detects a genuine Italian message", () => {
    const text =
      "Ciao, grazie per la risposta. Non sono riuscito a completare la procedura che mi hai indicato, quindi vorrei chiedere anche un altro chiarimento sulla configurazione del dominio.";

    expect(detect_language(text)?.language).toBe("it");
  });

  it("still detects a genuine Spanish message", () => {
    const text =
      "Hola, hemos recibido su pedido y le agradecemos su confianza. Puede consultar la factura adjunta para mas detalles.";

    expect(detect_language(text)?.language).toBe("es");
  });

  it("offers nothing for an English message signed with a foreign surname", () => {
    const decision = decide_translation({
      mode: "ask",
      translatable: true,
      message_id: "surname-only",
      body_text:
        "Hello,\nYES! It works without errors now, thanks a lot!\n\nBest regards,\nBruno Del Frate",
      target: "en",
      configured_accepted: [],
      never_languages: new Set<LanguageCode>(),
    });

    expect(decision.kind).toBe("idle");
  });
});
