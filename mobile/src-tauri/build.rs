fn main() {
    // Google Play requires 16 KB page-aligned native libraries for apps that
    // target Android 15+. Tauri sets CARGO_TARGET_<triple>_RUSTFLAGS itself,
    // which overrides any rustflags in .cargo/config.toml, so the linker flag
    // has to come from here, where it applies to this crate's cdylib link.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    }
    tauri_build::build()
}
