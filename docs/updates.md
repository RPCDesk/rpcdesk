# Updates

rpcdesk can check for and install its own releases. Checking is off by default for
unconfigured installs in the sense that no feed is set, so nothing happens until a feed
URL exists; the mode control decides what happens once one is.

## Modes

| Mode | Behaviour |
| --- | --- |
| Off | Never checks. The manual **Check now** button still works. |
| Check and ask (default) | Checks at startup and shows a banner with **Install and restart** / **Later**. |
| Install automatically | Checks at startup and installs the new version, then restarts. |

## Feed resolution

The update feed URL is resolved in this order:

1. the `endpoint` argument passed to the `check_update` / `install_update` commands (the UI passes the settings field),
2. `RPCDESK_UPDATE_ENDPOINT` (comma- or newline-separated list allowed),
3. `updateEndpoint` in `~/.rpcdesk/settings.json` (or the platform equivalent).

Only `http(s)` endpoints are accepted, and release builds reject plain `http` unless the
build overrides `plugins.updater.dangerousInsecureTransportProtocol`. Point the feed at
HTTPS in real deployments.

## Manifest

The feed is a Tauri updater manifest:

```json
{
  "version": "0.2.0",
  "notes": "Release notes",
  "pub_date": "2026-10-22T00:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "<minisign signature>", "url": "https://…/rpcdesk_0.2.0_aarch64.app.tar.gz" },
    "darwin-x86_64": { "signature": "…", "url": "…" },
    "linux-x86_64": { "signature": "…", "url": "…/rpcdesk_0.2.0_amd64.AppImage.tar.gz" },
    "windows-x86_64": { "signature": "…", "url": "…/rpcdesk_0.2.0_x64-setup.nsis.zip" }
  }
}
```

`tauri-action` with `includeUpdaterJson: true` writes exactly this file for the bundles it
builds, and `bun run build:app` produces the signed artifacts locally.

Windows payloads must be **stored** (uncompressed) zip archives: the updater reads them with
the `zip` crate built without compression codecs, and a deflated archive fails with
`unsupported Zip archive: Compression method not supported`. `bun run publish:update` writes
stored zips itself, so use it instead of `zip`/`7z` when publishing Windows releases. macOS
and Linux payloads are `.tar.gz` and unaffected.

## Publishing a release

```sh
bun run build:app                     # signed bundles in src-tauri/target/release/bundle
bun run publish:update \
  --version 0.2.0 --target darwin-aarch64 \
  --artifact "src-tauri/target/release/bundle/macos/rpcdesk.app" \
  --base-url https://example.com/rpcdesk --feed dist-updates
```

`publish:update` packages the artifact (`.app.tar.gz`, `.AppImage.tar.gz`, or a stored
`.nsis.zip`), signs it with the updater key, and merges the entry into `latest.json` in the
feed directory. Run it once per platform/target and upload the feed directory.

## Signing

Updates must be signed; the app verifies every download against the public key in
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`) before installing.

- Private key: `~/.Secrets/rpcdesk/updater.key` (not in the repository).
- Public key: committed in `src-tauri/tauri.conf.json`.
- `bun run build:app` picks the private key up automatically. Without it the build still
  succeeds, with updater artifacts disabled, so contributors can build without the key.
- `RPCDESK_SIGNING_KEY` overrides the key path.
- CI needs the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty password is fine, set it to an empty string).

Losing the private key means existing installations can never verify a new release, so
keep a backup outside the repository.

## Platform behaviour

| Platform | Install |
| --- | --- |
| macOS | Replaces the `.app` bundle and restarts. |
| Windows | Runs the NSIS installer in passive mode (`plugins.updater.windows.installMode`). |
| Linux (AppImage) | Replaces the running AppImage and restarts. |
| Linux (deb/rpm) | Not supported by the updater; the app surfaces the CLI error. Ship those through the package manager. |

## Diagnostics

Every check and install appends one line to `<logs>/updates.log` (macOS
`~/Library/Logs/rpcdesk`, Windows/Linux the app-support `logs` folder), including the
feed that was used and the failure text. That file is the fastest way to see why an update
did not happen.

## Verifying locally

```sh
# 1. build and sign a release
bun run build:app

# 2. serve a manifest that points at the signed artifact
python3 -m http.server 8001 --directory /tmp/pi-update-feed

# 3. point the app at it (Settings → Updates, or RPCDESK_UPDATE_ENDPOINT)
```

With `updateMode: "auto"` the app installs the new version on launch and restarts into it;
with `notify` it shows the banner first.
