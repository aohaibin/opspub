fn main() {
    // Cargo needs to relink the Windows executable when its embedded icon changes.
    println!("cargo:rerun-if-changed=../docs/icons/desktop/mint.ico");
    tauri_build::build()
}
