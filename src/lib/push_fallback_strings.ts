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
const PUSH_FALLBACK_STRINGS: Record<string, string> = {
  en: "You have a new message",
  ar: "لديك رسالة جديدة",
  de: "Sie haben eine neue Nachricht",
  es: "Tienes un mensaje nuevo",
  fr: "Vous avez un nouveau message",
  hi: "आपके पास एक नया संदेश है",
  it: "Hai un nuovo messaggio",
  ja: "新着メッセージがあります",
  ko: "새 메시지가 있습니다",
  nl: "Je hebt een nieuw bericht",
  pl: "Masz nową wiadomość",
  "pt-BR": "Você tem uma nova mensagem",
  pt: "Tem uma nova mensagem",
  ru: "У вас новое сообщение",
  tr: "Yeni bir mesajınız var",
  "zh-CN": "您有一封新邮件",
};

const PUSH_FALLBACK_REACTION_STRINGS: Record<string, string> = {
  en: "You have a new reaction",
  ar: "لديك تفاعل جديد",
  de: "Sie haben eine neue Reaktion",
  es: "Tienes una reacción nueva",
  fr: "Vous avez une nouvelle réaction",
  hi: "आपके पास एक नई प्रतिक्रिया है",
  it: "Hai una nuova reazione",
  ja: "新しいリアクションがあります",
  ko: "새 반응이 있습니다",
  nl: "Je hebt een nieuwe reactie",
  pl: "Masz nową reakcję",
  "pt-BR": "Você tem uma nova reação",
  pt: "Tem uma nova reação",
  ru: "У вас новая реакция",
  tr: "Yeni bir tepkiniz var",
  "zh-CN": "您有一个新回应",
};

export function push_fallback_languages(): string[] {
  return Object.keys(PUSH_FALLBACK_STRINGS);
}

function resolve_fallback(
  strings: Record<string, string>,
  language: string | undefined,
): string {
  const full = (language || "en").replace("_", "-").toLowerCase();
  const primary = full.split("-")[0];

  if (full === "pt-br") return strings["pt-BR"];
  if (primary === "zh") return strings["zh-CN"];

  return strings[primary] ?? strings.en;
}

export function push_fallback_body(language: string | undefined): string {
  return resolve_fallback(PUSH_FALLBACK_STRINGS, language);
}

export function push_fallback_reaction_body(
  language: string | undefined,
): string {
  return resolve_fallback(PUSH_FALLBACK_REACTION_STRINGS, language);
}
