// Desktop and connector binaries must not create a console in any Windows build.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    saveddesk_lib::run();
}
