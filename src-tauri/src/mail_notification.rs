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
use std::sync::Mutex;

use tauri::{Emitter, Manager, State};

pub const NOTIFICATION_ACTIVATED_EVENT: &str = "aster://notification-activated";

const OPEN_URL_PREFIX: &str = "aster://notification/open";
const EMAIL_ID_QUERY_KEY: &str = "id";
const MAX_EMAIL_ID_LENGTH: usize = 128;
const MAX_OPEN_URL_LENGTH: usize = 256;
const MAX_TITLE_LENGTH: usize = 256;
const MAX_BODY_LENGTH: usize = 1024;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NotificationOpen {
    pub email_id: Option<String>,
}

pub struct PendingNotificationOpen(Mutex<Option<String>>);

impl PendingNotificationOpen {
    pub fn new(initial: Option<NotificationOpen>) -> Self {
        Self(Mutex::new(initial.and_then(|open| open.email_id)))
    }

    fn set(&self, email_id: String) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = Some(email_id);
        }
    }

    fn take(&self) -> Option<String> {
        self.0.lock().ok().and_then(|mut guard| guard.take())
    }
}

pub fn accept_email_id(raw: &str) -> Option<String> {
    if raw.is_empty() || raw.len() > MAX_EMAIL_ID_LENGTH {
        return None;
    }

    if !raw
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }

    Some(raw.to_string())
}

pub fn open_url(email_id: Option<&str>) -> String {
    match email_id.and_then(accept_email_id) {
        Some(id) => format!("{OPEN_URL_PREFIX}?{EMAIL_ID_QUERY_KEY}={id}"),
        None => OPEN_URL_PREFIX.to_string(),
    }
}

pub fn parse_open_url(raw: &str) -> Option<NotificationOpen> {
    let trimmed = raw.trim().trim_end_matches('/');

    if trimmed.len() > MAX_OPEN_URL_LENGTH {
        return None;
    }

    let prefix = trimmed.get(..OPEN_URL_PREFIX.len())?;

    if !prefix.eq_ignore_ascii_case(OPEN_URL_PREFIX) {
        return None;
    }

    let rest = &trimmed[OPEN_URL_PREFIX.len()..];
    let rest = rest.strip_prefix('/').unwrap_or(rest);

    if rest.is_empty() {
        return Some(NotificationOpen { email_id: None });
    }

    let query = rest.strip_prefix('?')?;
    let email_id = query.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;

        (key == EMAIL_ID_QUERY_KEY).then(|| accept_email_id(value))?
    });

    Some(NotificationOpen { email_id })
}

pub fn open_from_args<S: AsRef<str>, I: IntoIterator<Item = S>>(
    args: I,
) -> Option<NotificationOpen> {
    args.into_iter()
        .skip(1)
        .find_map(|arg| parse_open_url(arg.as_ref()))
}

pub fn queue_open(app: &tauri::AppHandle, open: NotificationOpen, notify: bool) {
    let Some(email_id) = open.email_id else {
        return;
    };

    let state: State<PendingNotificationOpen> = app.state();
    state.set(email_id);

    if notify {
        let _ = app.emit(NOTIFICATION_ACTIVATED_EVENT, ());
    }
}

#[tauri::command]
pub fn take_pending_notification_open(state: State<PendingNotificationOpen>) -> Option<String> {
    state.take()
}

fn clamp_text(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .filter(|c| !c.is_control() || *c == '\n')
        .take(max_chars)
        .collect()
}

#[tauri::command]
pub async fn show_mail_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    email_id: Option<String>,
) -> std::result::Result<(), String> {
    let title = clamp_text(&title, MAX_TITLE_LENGTH);
    let body = clamp_text(&body, MAX_BODY_LENGTH);
    let launch = open_url(email_id.as_deref());

    tauri::async_runtime::spawn_blocking(move || platform::show(&app, &title, &body, &launch))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
mod platform {
    use windows::{
        core::HSTRING,
        Data::Xml::Dom::XmlDocument,
        UI::Notifications::{ToastNotification, ToastNotificationManager},
    };

    const TOAST_TEMPLATE: &str = "<toast activationType=\"protocol\"><visual><binding template=\"ToastGeneric\"><text></text><text></text></binding></visual></toast>";
    const POWERSHELL_APP_ID: &str =
        "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

    fn app_user_model_id(app: &tauri::AppHandle) -> String {
        let running_from_build_dir = tauri::utils::platform::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.to_path_buf()))
            .map(|dir| dir.ends_with("target/debug") || dir.ends_with("target/release"))
            .unwrap_or(false);

        if running_from_build_dir {
            POWERSHELL_APP_ID.to_string()
        } else {
            app.config().identifier.clone()
        }
    }

    pub fn build_toast_xml(
        title: &str,
        body: &str,
        launch: &str,
    ) -> windows::core::Result<XmlDocument> {
        let document = XmlDocument::new()?;
        document.LoadXml(&HSTRING::from(TOAST_TEMPLATE))?;
        document
            .DocumentElement()?
            .SetAttribute(&HSTRING::from("launch"), &HSTRING::from(launch))?;

        let texts = document.GetElementsByTagName(&HSTRING::from("text"))?;
        texts.Item(0)?.SetInnerText(&HSTRING::from(title))?;
        texts.Item(1)?.SetInnerText(&HSTRING::from(body))?;

        Ok(document)
    }

    pub fn show(
        app: &tauri::AppHandle,
        title: &str,
        body: &str,
        launch: &str,
    ) -> std::result::Result<(), String> {
        let document = build_toast_xml(title, body, launch).map_err(|e| e.to_string())?;
        let toast =
            ToastNotification::CreateToastNotification(&document).map_err(|e| e.to_string())?;
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(
            app_user_model_id(app),
        ))
        .map_err(|e| e.to_string())?;

        notifier.Show(&toast).map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
mod platform {
    use tauri_plugin_notification::NotificationExt;

    pub fn show(
        app: &tauri::AppHandle,
        title: &str,
        body: &str,
        _launch: &str,
    ) -> std::result::Result<(), String> {
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_and_parses_open_urls() {
        let url = open_url(Some("4f0c2a8e-91b3-4c4e-9a52-0d3f1e2b7c11"));

        assert_eq!(
            url,
            "aster://notification/open?id=4f0c2a8e-91b3-4c4e-9a52-0d3f1e2b7c11"
        );
        assert_eq!(
            parse_open_url(&url),
            Some(NotificationOpen {
                email_id: Some("4f0c2a8e-91b3-4c4e-9a52-0d3f1e2b7c11".into())
            })
        );
        assert_eq!(open_url(None), "aster://notification/open");
        assert_eq!(
            parse_open_url("aster://notification/open"),
            Some(NotificationOpen { email_id: None })
        );
        assert_eq!(
            parse_open_url("aster://notification/open/"),
            Some(NotificationOpen { email_id: None })
        );
    }

    #[test]
    fn drops_unsafe_email_ids() {
        assert_eq!(open_url(Some("a&b=<x>")), "aster://notification/open");
        assert_eq!(open_url(Some("")), "aster://notification/open");
        assert_eq!(
            open_url(Some(&"a".repeat(MAX_EMAIL_ID_LENGTH + 1))),
            "aster://notification/open"
        );
        assert_eq!(
            parse_open_url("aster://notification/open?id=..%2F..%2Fsettings"),
            Some(NotificationOpen { email_id: None })
        );
        assert_eq!(
            parse_open_url("aster://notification/open?id=abc%20def"),
            Some(NotificationOpen { email_id: None })
        );
    }

    #[test]
    fn rejects_other_links() {
        assert_eq!(parse_open_url("aster://oauth/callback?state=abc"), None);
        assert_eq!(parse_open_url("aster://notification/opener?id=abc"), None);
        assert_eq!(parse_open_url("aster://notification/open#id=abc"), None);
        assert_eq!(parse_open_url("mailto:a@b.c"), None);
        assert_eq!(
            parse_open_url(&format!("aster://notification/open?id={}", "a".repeat(300))),
            None
        );
    }

    #[test]
    fn finds_the_open_link_in_launch_args() {
        let args = [
            "C:\\Program Files\\Aster Mail\\Aster Mail.exe",
            "aster://notification/open?id=abc123",
        ];

        assert_eq!(
            open_from_args(args),
            Some(NotificationOpen {
                email_id: Some("abc123".into())
            })
        );
        assert_eq!(
            open_from_args(["aster://notification/open?id=abc123"]),
            None
        );
        assert_eq!(open_from_args(["exe", "--flag"]), None);
    }

    #[test]
    fn clamps_notification_text() {
        assert_eq!(clamp_text("a\u{0}b\u{7}c", 10), "abc");
        assert_eq!(clamp_text("abcdef", 3), "abc");
    }

    #[cfg(windows)]
    #[test]
    fn toast_xml_escapes_text_and_launch() {
        let document = platform::build_toast_xml(
            "<b>Aster</b> & \"friends\"",
            "</text><action content='x' arguments='y'/>",
            "aster://notification/open?id=abc&evil=1",
        )
        .expect("toast xml");
        let xml = document.GetXml().expect("xml").to_string();

        assert!(xml.contains("activationType=\"protocol\""), "{xml}");
        assert!(
            xml.contains("launch=\"aster://notification/open?id=abc&amp;evil=1\""),
            "{xml}"
        );
        assert!(xml.contains("&lt;b&gt;Aster&lt;/b&gt; &amp;"), "{xml}");
        assert!(!xml.contains("<action"), "{xml}");
        assert_eq!(
            document
                .GetElementsByTagName(&windows::core::HSTRING::from("text"))
                .expect("texts")
                .Length()
                .expect("length"),
            2
        );
    }
}
