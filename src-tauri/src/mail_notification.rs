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
#[cfg(any(test, all(unix, not(target_os = "macos"))))]
use std::sync::atomic::{AtomicUsize, Ordering};
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

pub fn activate(app: &tauri::AppHandle, open: NotificationOpen) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let was_visible = window.is_visible().unwrap_or(true);

    queue_open(app, open, was_visible);

    if !was_visible {
        let _ = window.eval("window.location.reload()");
    }

    crate::show_main_window(app);
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

    #[cfg(all(unix, not(target_os = "macos")))]
    if crate::flatpak::is_flatpak() {
        return crate::flatpak::notification::show(&app, &title, &body, &launch).await;
    }

    tauri::async_runtime::spawn_blocking(move || platform::show(&app, &title, &body, &launch))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
const PORTAL_SLOTS: usize = 64;

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
const MAX_SERVER_IDS: usize = 256;

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
pub(crate) struct PortalSlots(AtomicUsize);

#[cfg(all(unix, not(target_os = "macos")))]
pub(crate) static PORTAL_SLOTS_IN_USE: PortalSlots = PortalSlots::new();

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
fn portal_slot_id(slot: usize) -> String {
    format!("mail-{slot}")
}

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
impl PortalSlots {
    pub(crate) const fn new() -> Self {
        Self(AtomicUsize::new(0))
    }

    pub(crate) fn next_id(&self) -> String {
        portal_slot_id(self.0.fetch_add(1, Ordering::Relaxed) % PORTAL_SLOTS)
    }

    pub(crate) fn ids_to_remove(&self) -> Vec<String> {
        (0..PORTAL_SLOTS).map(portal_slot_id).collect()
    }
}

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
pub(crate) struct ServerIds(Mutex<Vec<u32>>);

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
impl ServerIds {
    pub(crate) const fn new() -> Self {
        Self(Mutex::new(Vec::new()))
    }

    pub(crate) fn remember(&self, id: u32) {
        let mut ids = self.0.lock().unwrap_or_else(|e| e.into_inner());

        if ids.len() >= MAX_SERVER_IDS {
            ids.remove(0);
        }
        ids.push(id);
    }

    pub(crate) fn take(&self) -> Vec<u32> {
        std::mem::take(&mut *self.0.lock().unwrap_or_else(|e| e.into_inner()))
    }
}

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
pub(crate) fn close_each<T>(
    ids: Vec<T>,
    mut close: impl FnMut(T) -> std::result::Result<(), String>,
) -> std::result::Result<(), String> {
    let mut first_error = None;

    for id in ids {
        if let Err(error) = close(id) {
            first_error.get_or_insert(error);
        }
    }

    first_error.map_or(Ok(()), Err)
}

#[cfg(any(test, all(unix, not(target_os = "macos"))))]
pub(crate) async fn remove_portal_notifications<F, Fut>(
    ids: Vec<String>,
    remove: F,
) -> std::result::Result<(), String>
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = std::result::Result<(), String>>,
{
    let mut first_error = None;

    for id in ids {
        if let Err(error) = remove(id).await {
            first_error.get_or_insert(error);
        }
    }

    first_error.map_or(Ok(()), Err)
}

#[tauri::command]
pub async fn clear_mail_notifications(app: tauri::AppHandle) -> std::result::Result<(), String> {
    #[cfg(all(unix, not(target_os = "macos")))]
    if crate::flatpak::is_flatpak() {
        return crate::flatpak::notification::clear(&app).await;
    }

    tauri::async_runtime::spawn_blocking(move || platform::clear(&app))
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

    pub fn clear(app: &tauri::AppHandle) -> std::result::Result<(), String> {
        ToastNotificationManager::History()
            .and_then(|history| history.ClearWithId(&HSTRING::from(app_user_model_id(app))))
            .map_err(|e| e.to_string())
    }
}

#[cfg(target_os = "macos")]
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

    #[allow(deprecated)]
    pub fn remove_delivered() -> bool {
        use objc2::{msg_send, rc::Retained, ClassType};
        use objc2_foundation::NSUserNotificationCenter;

        let center: Option<Retained<NSUserNotificationCenter>> = unsafe {
            msg_send![
                NSUserNotificationCenter::class(),
                defaultUserNotificationCenter
            ]
        };

        match center {
            Some(center) => {
                center.removeAllDeliveredNotifications();
                true
            }
            None => false,
        }
    }

    pub fn clear(_app: &tauri::AppHandle) -> std::result::Result<(), String> {
        remove_delivered();

        Ok(())
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use notify_rust::{Hint, Notification};
    use zbus::blocking::Connection;
    use zbus::zvariant::Value;

    use super::{close_each, ServerIds};

    const BUS_NAME: &str = "org.freedesktop.Notifications";
    const BUS_PATH: &str = "/org/freedesktop/Notifications";
    const BUS_INTERFACE: &str = "org.freedesktop.Notifications";
    const DEFAULT_TIMEOUT: i32 = -1;

    static SHOWN: ServerIds = ServerIds::new();
    static CONNECTION: Mutex<Option<Connection>> = Mutex::new(None);

    pub fn build_notification(title: &str, body: &str) -> Notification {
        Notification::new()
            .summary(title)
            .body(body)
            .auto_icon()
            .hint(Hint::Transient(true))
            .finalize()
    }

    pub fn server_hints(notification: &Notification) -> HashMap<&'static str, Value<'static>> {
        notification
            .hints
            .iter()
            .filter_map(|hint| match hint {
                Hint::Transient(value) => Some(("transient", Value::from(*value))),
                _ => None,
            })
            .collect()
    }

    fn with_connection<T>(
        call: impl FnOnce(&Connection) -> zbus::Result<T>,
    ) -> std::result::Result<T, String> {
        let mut slot = CONNECTION.lock().unwrap_or_else(|e| e.into_inner());

        if slot.is_none() {
            *slot = Some(Connection::session().map_err(|e| e.to_string())?);
        }

        let result = slot.as_ref().map(call).ok_or("no session bus")?;

        if result.is_err() {
            *slot = None;
        }

        result.map_err(|e| e.to_string())
    }

    pub fn show(
        _app: &tauri::AppHandle,
        title: &str,
        body: &str,
        _launch: &str,
    ) -> std::result::Result<(), String> {
        let notification = build_notification(title, body);
        let hints = server_hints(&notification);
        let actions: Vec<String> = Vec::new();

        let server_id = with_connection(|connection| {
            connection
                .call_method(
                    Some(BUS_NAME),
                    BUS_PATH,
                    Some(BUS_INTERFACE),
                    "Notify",
                    &(
                        &notification.appname,
                        0u32,
                        &notification.icon,
                        &notification.summary,
                        &notification.body,
                        &actions,
                        &hints,
                        DEFAULT_TIMEOUT,
                    ),
                )?
                .body()
                .deserialize::<u32>()
        })?;
        SHOWN.remember(server_id);

        Ok(())
    }

    pub fn clear(_app: &tauri::AppHandle) -> std::result::Result<(), String> {
        let ids = SHOWN.take();

        if ids.is_empty() {
            return Ok(());
        }

        close_each(ids, |id| {
            with_connection(|connection| {
                connection
                    .call_method(
                        Some(BUS_NAME),
                        BUS_PATH,
                        Some(BUS_INTERFACE),
                        "CloseNotification",
                        &(id,),
                    )
                    .map(|_| ())
            })
        })
    }
}

#[cfg(test)]
mod tests {

    use super::*;

    fn remove_portal(
        ids: Vec<String>,
        fail_on: &str,
    ) -> (Vec<String>, std::result::Result<(), String>) {
        let removed = Mutex::new(Vec::new());
        let result = tauri::async_runtime::block_on(remove_portal_notifications(ids, |id| {
            let failed = id == fail_on;
            removed.lock().unwrap().push(id);
            async move {
                if failed {
                    Err("portal refused".to_string())
                } else {
                    Ok(())
                }
            }
        }));

        (removed.into_inner().unwrap(), result)
    }

    #[test]
    fn portal_clear_reaches_notifications_shown_before_a_restart() {
        let before_restart = PortalSlots::new();
        let shown_earlier = before_restart.next_id();
        let after_restart = PortalSlots::new();

        let (removed, result) = remove_portal(after_restart.ids_to_remove(), "");

        assert!(removed.contains(&shown_earlier));
        assert_eq!(removed.len(), PORTAL_SLOTS);
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn portal_slots_reuse_ids_that_clear_removes() {
        let slots = PortalSlots::new();
        let shown: Vec<String> = (0..PORTAL_SLOTS + 3).map(|_| slots.next_id()).collect();
        let to_remove = slots.ids_to_remove();

        assert!(shown.iter().all(|id| to_remove.contains(id)));
        assert_eq!(shown[PORTAL_SLOTS], shown[0]);
    }

    #[test]
    fn portal_clear_keeps_removing_after_an_error() {
        let ids = vec!["mail-0".to_string(), "mail-1".to_string()];

        let (removed, result) = remove_portal(ids.clone(), "mail-0");

        assert_eq!(removed, ids);
        assert_eq!(result, Err("portal refused".to_string()));
    }

    #[test]
    fn server_ids_close_once_and_keep_the_newest() {
        let ids = ServerIds::new();
        for id in 0..(MAX_SERVER_IDS as u32 + 2) {
            ids.remember(id);
        }

        let mut closed = Vec::new();
        let result = close_each(ids.take(), |id| {
            closed.push(id);
            if id == 5 {
                Err("server refused".to_string())
            } else {
                Ok(())
            }
        });

        assert_eq!(closed.len(), MAX_SERVER_IDS);
        assert_eq!(closed.first(), Some(&2));
        assert_eq!(result, Err("server refused".to_string()));
        assert!(ids.take().is_empty());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn desktop_notifications_skip_the_server_history() {
        let notification = platform::build_notification("Sender", "Subject");

        assert_eq!(notification.summary, "Sender");
        assert_eq!(notification.body, "Subject");
        assert!(notification
            .hints
            .contains(&notify_rust::Hint::Transient(true)));
        assert_eq!(
            platform::server_hints(&notification).get("transient"),
            Some(&zbus::zvariant::Value::from(true))
        );
    }

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

    #[cfg(target_os = "macos")]
    #[test]
    fn clearing_without_a_notification_center_returns_quietly() {
        assert!(!platform::remove_delivered());
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
