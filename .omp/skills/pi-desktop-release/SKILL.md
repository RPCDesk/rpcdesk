---
name: pi-desktop-release
description: Build, sign, publish, and verify a Pi Desktop release, including its self-update feed. Use when cutting a version, producing installers (macOS, Linux deb/rpm/AppImage, Windows NSIS), publishing updates, or diagnosing a release that fails to build, bundle, or install itself.
---

# Releasing Pi Desktop

Read `HANDOFF.md` for current state and `docs/updates.md` for the feed format.

## 1. Prepare the version

Bump the version in **both** places, or the app and the bundle will disagree:

```sh
# package.json → "version"
# src-tauri/tauri.conf.json → "version"
```

Then, on the host:

```sh
bun install --frozen-lockfile
bun run typecheck && bun run test
cargo test --manifest-path src-tauri/Cargo.toml
```

## 2. Build with signing

```sh
bun run build:app
```

`scripts/build-app.ts` uses `~/.Secrets/pi-desktop/updater.key` when present (override path with
`PI_DESKTOP_SIGNING_KEY`) and signs `*.tar.gz`/`.nsis.zip` updater artifacts. Without a key the
build still succeeds, with updater artifacts disabled — fine for local testing, useless for a
release. Bump the version before building; the manifest relies on it.

Artifacts land in `src-tauri/target/release/bundle/<kind>/`.

## 3. Publish the feed entry

```sh
bun run publish:update --version X.Y.Z --target <target> \
  --artifact "<path to .app | .AppImage | setup.exe>" \
  --base-url https://example.com/pi-desktop --feed dist-updates --notes "…"
```

Targets: `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`, `windows-x86_64` (use the platform
the artifact was built on; a macOS `.app` cannot serve Linux).

Rules the script enforces and you must not break:

- Feed URLs must be **HTTPS** in release builds (`plugins.updater.dangerousInsecureTransportProtocol`
  is only for local testing).
- Windows payloads must be **stored** zips — `publish:update` writes them itself; never hand-roll
  one with `zip`/`7z`, or installation fails with `Compression method not supported`.
- Signatures are per-artifact; a manifest entry without a valid `signature` is rejected by clients.

## 4. Build the other platforms natively

Cross-builds prove nothing. Use the VMs documented in `docs/vms.md`:

```sh
# Linux (Debian arm64)
ssh -i ~/.ssh/pi_vm_ed25519 pi@10.211.55.3
cd ~/pi-desktop && sudo rm -rf /tmp/* && \
  PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH" bun run tauri build --bundles deb,rpm,appimage

# Windows (x64 build on the arm64 guest)
prlctl exec pi-windows --user pi --password pi cmd /c "call \"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat\" arm64_x64 >nul && cd /d %USERPROFILE%\pi-desktop && set PATH=%USERPROFILE%\.bun\bin;%USERPROFILE%\.cargo\bin;%PATH% && set \"RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc\" && bun run tauri build --target x86_64-pc-windows-msvc --bundles nsis"
```

Windows guests need `RUSTUP_TOOLCHAIN` quoted (`set "VAR=value"`); a trailing space breaks rustup.
Linux guests need `/tmp` cleared (1.5 GB tmpfs) and the GPU workaround flags to run the UI.

## 5. Verify the update path, not just the build

1. Install/build version N-1 somewhere outside a TCC-protected folder (macOS: `/Applications`).
2. Serve the feed (`python3 -m http.server`) or point at the real URL.
3. Set `updateMode` (`notify`) and `updateEndpoint`, launch, and confirm the banner.
4. Install, restart, and confirm the running version changed (`getVersion` / executable
   ProductVersion) and that `updates.log` records `found … → installing … → installed`.

Per-platform install behavior: macOS replaces the `.app`, Windows runs the NSIS installer in
passive mode, Linux replaces the running AppImage. `.deb`/`.rpm` installs cannot self-update.

## 6. Ship

- Push the feed directory (`latest.json` + archives) to the host serving the endpoint.
- Keep the private key backed up outside the repository; losing it permanently strands existing
  installations.
- CI (`.github/workflows/build.yml`) expects `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and uploads bundles with `includeUpdaterJson`.
- Record the release in `HANDOFF.md`: version, platforms built, what was verified where.
