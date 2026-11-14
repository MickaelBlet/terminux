// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMABUF renderer shows a blank window on WSLg and some GPU drivers.
    #[cfg(target_os = "linux")]
    {
        // SAFETY: single-threaded at this point, before any thread is spawned.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
        }
        // AppImage bundles its own GTK: host GTK modules can't load in it.
        if std::env::var_os("APPIMAGE").is_some() {
            unsafe { std::env::remove_var("GTK_MODULES") };
        }
    }
    terminux_lib::run()
}
