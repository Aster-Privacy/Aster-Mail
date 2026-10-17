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
use std::path::Path;

const REMOTE_SESSION_VARS: &[&str] = &[
    "XRDP_SESSION",
    "XRDP_SOCKET_PATH",
    "X2GO_SESSION",
    "X2GO_AGENT_PID",
    "NXSESSIONID",
    "VNCDESKTOP",
    "CHROME_REMOTE_DESKTOP_SESSION",
];

const MESA_EGL_VENDOR_FILES: &[&str] = &[
    "/usr/share/glvnd/egl_vendor.d/50_mesa.json",
    "/usr/local/share/glvnd/egl_vendor.d/50_mesa.json",
    "/etc/glvnd/egl_vendor.d/50_mesa.json",
];

const UNSTARTED_LAUNCH_LIMIT: u32 = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RenderNodes {
    Missing,
    Denied,
    Usable,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RenderingProbe {
    pub remote_session: Option<String>,
    pub render_nodes: RenderNodes,
    pub x11_dri3: Option<bool>,
    pub vnc_server: bool,
    pub nvidia_driver: bool,
    pub unstarted_launches: u32,
    pub software_marker: bool,
}

pub fn software_reason(probe: &RenderingProbe) -> Option<String> {
    if probe.software_marker {
        return Some("earlier launches did not start".to_string());
    }
    if probe.unstarted_launches >= UNSTARTED_LAUNCH_LIMIT {
        return Some(format!(
            "{} launches in a row did not start",
            probe.unstarted_launches
        ));
    }
    if let Some(var) = &probe.remote_session {
        return Some(format!("remote session ({var})"));
    }
    if probe.vnc_server {
        return Some("remote session (vnc x server)".to_string());
    }
    if probe.render_nodes == RenderNodes::Denied {
        return Some("gpu render node cannot be opened".to_string());
    }
    if probe.nvidia_driver {
        return None;
    }
    if probe.render_nodes == RenderNodes::Missing {
        return Some("no gpu render node".to_string());
    }
    if probe.x11_dri3 == Some(false) {
        return Some("x server has no dri3".to_string());
    }

    None
}

fn remote_session_var() -> Option<String> {
    REMOTE_SESSION_VARS
        .iter()
        .find(|name| {
            std::env::var_os(name)
                .map(|value| !value.is_empty())
                .unwrap_or(false)
        })
        .map(|name| name.to_string())
}

fn render_node_access(dri_dir: &Path) -> RenderNodes {
    let Ok(entries) = std::fs::read_dir(dri_dir) else {
        return RenderNodes::Missing;
    };
    let mut found = false;
    for entry in entries.flatten() {
        let name = entry.file_name();
        if !name.to_string_lossy().starts_with("renderD") {
            continue;
        }
        found = true;
        if std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(entry.path())
            .is_ok()
        {
            return RenderNodes::Usable;
        }
    }
    if found {
        RenderNodes::Denied
    } else {
        RenderNodes::Missing
    }
}

pub fn uses_x11(
    wayland_display: Option<&str>,
    gdk_backend: Option<&str>,
    display: Option<&str>,
) -> bool {
    if display.map(str::is_empty).unwrap_or(true) {
        return false;
    }
    if let Some(backend) = gdk_backend {
        let first = backend.split(',').next().unwrap_or("").trim();
        if first == "x11" {
            return true;
        }
        if first == "wayland" {
            return false;
        }
    }

    wayland_display.map(str::is_empty).unwrap_or(true)
}

struct X11Extensions {
    dri3: bool,
    vnc: bool,
}

fn query_x11_extensions() -> Option<X11Extensions> {
    use std::ffi::CString;

    let xlib = x11_dl::xlib::Xlib::open().ok()?;
    let display = unsafe { (xlib.XOpenDisplay)(std::ptr::null()) };
    if display.is_null() {
        return None;
    }
    let has = |name: &str| -> bool {
        let Ok(name) = CString::new(name) else {
            return false;
        };
        let (mut opcode, mut event, mut error) = (0, 0, 0);
        unsafe {
            (xlib.XQueryExtension)(
                display,
                name.as_ptr(),
                &mut opcode,
                &mut event,
                &mut error,
            ) != 0
        }
    };
    let result = X11Extensions {
        dri3: has("DRI3"),
        vnc: has("VNC-EXTENSION"),
    };
    unsafe {
        (xlib.XCloseDisplay)(display);
    }

    Some(result)
}

fn env_value(name: &str) -> Option<String> {
    std::env::var(name).ok()
}

pub fn probe(unstarted_launches: u32, software_marker: bool) -> RenderingProbe {
    let x11 = uses_x11(
        env_value("WAYLAND_DISPLAY").as_deref(),
        env_value("GDK_BACKEND").as_deref(),
        env_value("DISPLAY").as_deref(),
    );
    let extensions = if x11 { query_x11_extensions() } else { None };

    RenderingProbe {
        remote_session: remote_session_var(),
        render_nodes: render_node_access(Path::new("/dev/dri")),
        x11_dri3: extensions.as_ref().map(|ext| ext.dri3),
        vnc_server: extensions.as_ref().map(|ext| ext.vnc).unwrap_or(false),
        nvidia_driver: Path::new("/proc/driver/nvidia/version").exists(),
        unstarted_launches,
        software_marker,
    }
}

pub fn software_env() -> Vec<(&'static str, String)> {
    let mut vars = vec![
        ("LIBGL_ALWAYS_SOFTWARE", "1".to_string()),
        ("WEBKIT_DISABLE_COMPOSITING_MODE", "1".to_string()),
        ("WEBKIT_DISABLE_THREADED_COMPOSITOR", "1".to_string()),
        ("WEBKIT_SKIA_ENABLE_CPU_RENDERING", "1".to_string()),
        ("WEBKIT_FORCE_VBLANK_TIMER", "1".to_string()),
    ];
    if let Some(vendor) = MESA_EGL_VENDOR_FILES
        .iter()
        .find(|path| Path::new(path).is_file())
    {
        vars.push(("__EGL_VENDOR_LIBRARY_FILENAMES", vendor.to_string()));
    }

    vars
}

pub fn apply_software_env() -> Vec<&'static str> {
    let mut applied = Vec::new();
    for (name, value) in software_env() {
        if std::env::var_os(name).is_some() {
            continue;
        }
        std::env::set_var(name, value);
        applied.push(name);
    }

    applied
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gpu_desktop() -> RenderingProbe {
        RenderingProbe {
            remote_session: None,
            render_nodes: RenderNodes::Usable,
            x11_dri3: Some(true),
            vnc_server: false,
            nvidia_driver: false,
            unstarted_launches: 0,
            software_marker: false,
        }
    }

    #[test]
    fn keeps_gpu_on_a_normal_x11_desktop() {
        assert_eq!(software_reason(&gpu_desktop()), None);
    }

    #[test]
    fn keeps_gpu_on_wayland() {
        let probe = RenderingProbe {
            x11_dri3: None,
            ..gpu_desktop()
        };
        assert_eq!(software_reason(&probe), None);
    }

    #[test]
    fn uses_software_in_an_xrdp_session() {
        let probe = RenderingProbe {
            remote_session: Some("XRDP_SESSION".to_string()),
            ..gpu_desktop()
        };
        assert!(software_reason(&probe).unwrap().contains("XRDP_SESSION"));
    }

    #[test]
    fn uses_software_on_a_vnc_x_server() {
        let probe = RenderingProbe {
            vnc_server: true,
            ..gpu_desktop()
        };
        assert!(software_reason(&probe).is_some());
    }

    #[test]
    fn uses_software_when_the_render_node_is_denied() {
        let probe = RenderingProbe {
            render_nodes: RenderNodes::Denied,
            nvidia_driver: true,
            ..gpu_desktop()
        };
        assert!(software_reason(&probe).is_some());
    }

    #[test]
    fn uses_software_without_render_node_or_dri3() {
        let missing = RenderingProbe {
            render_nodes: RenderNodes::Missing,
            ..gpu_desktop()
        };
        assert!(software_reason(&missing).is_some());
        let no_dri3 = RenderingProbe {
            x11_dri3: Some(false),
            ..gpu_desktop()
        };
        assert!(software_reason(&no_dri3).is_some());
    }

    #[test]
    fn keeps_nvidia_without_render_node_or_dri3() {
        let probe = RenderingProbe {
            render_nodes: RenderNodes::Missing,
            x11_dri3: Some(false),
            nvidia_driver: true,
            ..gpu_desktop()
        };
        assert_eq!(software_reason(&probe), None);
    }

    #[test]
    fn falls_back_after_repeated_failed_launches() {
        let once = RenderingProbe {
            unstarted_launches: 1,
            ..gpu_desktop()
        };
        assert_eq!(software_reason(&once), None);
        let twice = RenderingProbe {
            unstarted_launches: 2,
            ..gpu_desktop()
        };
        assert!(software_reason(&twice).is_some());
        let marked = RenderingProbe {
            software_marker: true,
            ..gpu_desktop()
        };
        assert!(software_reason(&marked).is_some());
    }

    #[test]
    fn detects_x11_backend() {
        assert!(uses_x11(None, None, Some(":10")));
        assert!(!uses_x11(Some("wayland-0"), None, Some(":0")));
        assert!(uses_x11(Some("wayland-0"), Some("x11"), Some(":0")));
        assert!(!uses_x11(None, Some("wayland,x11"), Some(":0")));
        assert!(!uses_x11(None, None, None));
        assert!(!uses_x11(None, None, Some("")));
    }

    #[test]
    fn reads_render_node_access() {
        let dir = std::env::temp_dir().join(format!("aster_dri_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(render_node_access(&dir), RenderNodes::Missing);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("card0"), b"").unwrap();
        assert_eq!(render_node_access(&dir), RenderNodes::Missing);
        std::fs::write(dir.join("renderD128"), b"").unwrap();
        assert_eq!(render_node_access(&dir), RenderNodes::Usable);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn software_env_forces_cpu_rendering() {
        let names: Vec<&str> = software_env().iter().map(|(name, _)| *name).collect();
        assert!(names.contains(&"LIBGL_ALWAYS_SOFTWARE"));
        assert!(names.contains(&"WEBKIT_DISABLE_COMPOSITING_MODE"));
        assert!(names.contains(&"WEBKIT_FORCE_VBLANK_TIMER"));
    }
}
