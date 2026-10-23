> Superseded by [ADR 0002](0002-cli-rpc-bridge.md). This records the original SDK-sidecar decision.

# Bun SDK sidecar for agent integration

rpcdesk embeds `@oh-my-pi/pi-coding-agent` and `@earendil-works/pi-coding-agent` in one Bun process per tab instead of speaking RPC or ACP to installed CLIs. The SDK exposes sessions, streaming events, model registries, extension UI contexts, and approval resolvers in-process for both harnesses, so one protocol and one permission bridge cover both. The cost is bundling Bun plus both SDK trees (~200 MB .app) and accepting that app and CLI versions are pinned separately. RPC/ACP would avoid the runtime bundle but require two adapters and would not expose the same UI hooks.
