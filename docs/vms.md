# Test VMs

Local Parallels VMs used to exercise the Linux and Windows builds. They are development machines, not release infrastructure; the CI matrix in `.github/workflows/build.yml` is what produces distributable bundles.

## Linux (`pi-linux`)

| Item | Value |
| --- | --- |
| Guest | Debian 13 arm64, XFCE |
| Resources | 2 vCPU, 3 GB RAM, 64 GB sparse disk, 4 GB swap |
| User | `pi` / `pi`, LightDM autologin |
| SSH | `ssh -i ~/.ssh/pi_vm_ed25519 pi@10.211.55.3` |
| Repo | `~/pi-desktop` |
| Toolchain | Bun 1.4.4, Rust 1.99.1 |
| Installer | preseeded ISO built from `debian-13.7.0-arm64-netinst.iso` |

Build and run:

```sh
cd ~/pi-desktop
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
bun install --frozen-lockfile
bun run build:web && bun run stage:sidecar
(cd src-tauri && cargo build --release)

# run inside the X session (software rendering; the VM has no usable GPU)
DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority XDG_RUNTIME_DIR=/run/user/1000 \
LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
dbus-run-session -- ~/pi-desktop/src-tauri/target/release/pi-desktop
```

A user unit (`~/.config/systemd/user/pi-desktop.service`) wraps the same command for `systemctl --user start pi-desktop`.

The VM has no provider credentials. Sessions stop with “No default model selected” until an API key or model is configured, which is the expected CLI behaviour.

Verified in this VM: typecheck and unit tests, release build, `.deb`/`.rpm`/`.AppImage` bundling, app UI, runtime download of `omp-linux-arm64` with SHA-256 verification, the omp RPC handshake, launching the built AppImage, and a real AppImage self-update (the file was replaced in place with the 0.2.0 build, verified by hash).

The AppImage bundler does not clean its staging directories. `bun run stage:sidecar` now removes `target/release/resources` and the `appimage*` staging folders so a repeated build cannot pick up a stale runtime payload.

## Windows (`pi-windows`)

| Item | Value |
| --- | --- |
| Guest | Windows 11 ARM64 (26H2) |
| Resources | 4 vCPU, 4 GB RAM, 256 GB sparse disk, TPM + Secure Boot |
| User | `pi` / `pi`, autologon |
| Install | unattended via a second DVD (`autounattend.iso`) |

The Windows ISO is official Microsoft ARM64 media. Boot order is `cdrom0 cdrom1 hdd0`; when the media asks “Press any key to boot from CD or DVD”, send a key within a few seconds.

Parallels Tools is required for the network adapter: without it the guest has no NIC and no IP. Install it by running the mounted tools DVD elevated (`D:\autorun_arm64.exe`, then approve the UAC prompt) and reboot. After that `prlctl exec` works:

```sh
prlctl exec pi-windows cmd /c ver
prlctl exec pi-windows --user pi --password pi cmd /c "%USERPROFILE%\.bun\bin\bun.exe --version"
```

The guest user is a UAC-split administrator, so machine-wide installs must run through `prlctl exec` without `--user` (SYSTEM) or through an approved elevation prompt. Installed for this VM:

- Bun 1.4.4 (`irm https://bun.sh/install.ps1 | iex` as `pi`)
- Rust 1.99.1 `aarch64-pc-windows-msvc` (`rustup-init.exe` as `pi`)
- Visual Studio 2022 Build Tools with the C++ workload and Windows SDK (installed as SYSTEM, machine-wide)
- Repo copy at `C:\Users\pi\pi-desktop`

Build and run:

```sh
prlctl exec pi-windows --user pi --password pi cmd /c "call \"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat\" arm64_x64 >nul && cd /d %USERPROFILE%\pi-desktop && set PATH=%USERPROFILE%\.bun\bin;%USERPROFILE%\.cargo\bin;%PATH% && set \"RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc\" && bun run tauri build --target x86_64-pc-windows-msvc --bundles nsis"
```

Notes for this guest:

- The Visual Studio instance installed here has `HostARM64\x64`/`Hostx64\x64` tools but no ARM64-targeting MSVC toolset (`HostARM64\arm64`), and the `Microsoft.VisualStudio.Component.VC.Tools.ARM64` component would not install through the x64 bootstrapper. Host builds therefore use the **x64** Rust toolchain under Windows' x64 emulation (`vcvarsall arm64_x64` + `RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc`), producing the standard `x86_64-pc-windows-msvc` bundle.
- `RUSTUP_TOOLCHAIN` must be set with `set "VAR=value"`; `set VAR=value &&` captures a trailing space and rustup rejects the name.
- Launch the built app in the interactive session with a scheduled task; `prlctl exec` runs in session 0 and cannot show a window:

```sh
prlctl exec pi-windows --user pi --password pi cmd /c "schtasks /create /tn PiDesktop /tr \"%USERPROFILE%\pi-desktop\src-tauri\target\x86_64-pc-windows-msvc\release\pi-desktop.exe\" /sc once /st 23:59 /ru pi /it /f & schtasks /run /tn PiDesktop"
```

Verified in this VM: unit tests, release build, NSIS bundle, the app UI, `bun.bin` extraction to `%LOCALAPPDATA%\Pi Desktop\bin`, managed runtime resolution, an omp session whose stderr is surfaced in the app, and a real in-place update (installed 0.1.0 → 0.2.0 via the NSIS updater; the update log shows the feed, the found version, and the install).

Updater test flow used here: build the new version with `--config` pointing at a JSON file that sets `plugins.updater.dangerousInsecureTransportProtocol` (the local feed is plain HTTP), upload the installer to the host with `curl -F`, publish it with `bun run publish:update --target windows-x86_64`, and serve the feed from the host.

Keyboard automation is available through `prlctl send-key-event` (see `~/Parallels/vm-assets/prltype.py` on the host for a small typing helper).

## Host helpers

`prlctl` drives both VMs:

```sh
prlctl list -f
prlctl start pi-linux
prlctl capture pi-linux --file /tmp/vm.png
prlctl send-key-event pi-linux -k 36 -e press
prlctl stop pi-windows
```

Full host-side notes, including ISO paths and the preseed server, live in `~/Parallels/vm-assets/README.md`.
