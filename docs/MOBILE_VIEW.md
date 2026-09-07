# Mobile View

Mobile View is a compact presentation of the existing DeepSeek Harness Web client. It is not a second chat application: the same Host, workspace catalog, sessions, live events, conversation views, tool approvals, and plugin slots remain in use.

## Activation

The client enables Mobile View through `matchMedia('(max-width: 834px)')`. It reacts when the viewport crosses that boundary, so phones, portrait tablets, split-screen windows, and desktop browser device emulation all exercise the same code path. There are no `view` URL parameters, user-agent branches, cookies, or separate mobile bundle.

Presentation remains independent of authorization: changing the viewport never grants or removes Harness permissions.

## Features

- **Compact navigation:** the stock Harness workspace and session browser opens as a left drawer over the conversation.
- **Existing sessions:** Search, View options, workspaces, sessions, rename, archive, and the active-workspace actions stay native Harness operations.
- **Dynamic views:** Chat, Trajectory, composer extensions, overlays, and third-party conversation tabs continue to resolve from Harness plugin slots.
- **Current session:** a right drawer shows context usage and its System prompt / Tools / Messages breakdown, model, workspace access, agent preset, activity statistics, and session-log download.
- **Subagents:** a compact status chip exposes total and active counts with the native activity state, then opens the nested subagent catalog as a touch-friendly bottom sheet.
- **Appearance:** a sun/moon action uses the Harness theme service. In Harness `0.1.1-rc.2`, remote theme storage is page-memory-backed, so reload returns to the host preference and resolves `system` against the phone or tablet.
- **Touch behavior:** native session and active-workspace overflow actions remain visible without a long press, and switching sessions does not automatically focus the composer or open the software keyboard.
- **Keyboard accessibility:** plugin-owned modal drawers receive and contain focus, close with Escape, and restore focus to their invoking control.
- **Responsive AppFrame:** safe-area insets, full-viewport scrims, scrollable tab groups, media bounds, and matching left/right drawers enhance the shipped Harness layout only while the media query matches.

The remote boot deliberately omits the host directory-picker capability. Existing workspaces remain available, but `Add workspace` is not shown because selecting a directory on the Harness computer from a remote phone is misleading.

## Permissions

Mobile View does not introduce a second permission system. The remote browser receives the same current Harness session and uses its selected workspace access:

- **Read only** — project reads without workspace writes.
- **Workspace write** — writes inside the selected workspace.
- **Full access** — the broader authority configured for that Harness session.

The Current session drawer displays the active value but does not change it. Removing `Add workspace` is a usability measure, not an authorization boundary. A paired browser can still read project data, submit prompts, approve actions, and run every operation allowed by the current Harness session.

## Supported sizes and release checks

The responsive enhancements target viewports from **360 through 834 CSS pixels wide**. Wider viewports keep the stock desktop presentation. The supported lower bound is a release target, not a forced minimum page width.

The release browser matrix is:

| Viewport | Acceptance focus |
| --- | --- |
| `360 × 800` | Minimum width, long labels, keyboard, drawers |
| `390 × 844` | Typical phone composition and safe areas |
| `430 × 932` | Large phone, session details, subagents |
| `768 × 1024` | Tablet drawer proportions and dynamic tabs |

Landscape phones, split-screen browsers, virtual keyboards, third-party fixed-width views, and operating-system text scaling remain real-device acceptance surfaces. A green unit-test gate proves contracts and source invariants, not every browser layout.

## Harness integration boundary

Mobile View keeps the official Harness root and AppFrame mounted. It contributes controls through overlay, conversation, theme, session, locale, button, and input contracts wherever Harness exposes them. The stock desktop presentation is unchanged when the media query does not match.

Harness `0.1.1-rc.2` does not expose a public responsive shell, drawer recipe, spacing/radius scale, or every required glyph. The plugin therefore owns mobile geometry and a small number of scoped presentation adapters for stock brand, workspace, session-action, and feedback elements. Those hooks are documented in [Architecture and compatibility boundaries](ARCHITECTURE.md) and must be retested for each supported Harness version.

## Security

Mobile View uses the same one-use invitation, paired-browser credential, private-network validation, HTTP/WebSocket gateway, and revocation behavior as desktop-shaped remote access. It adds no relay, account, analytics, fingerprinting, polling loop, or duplicate conversation store.

LAN traffic remains plain HTTP in this preview. Revoking a paired device blocks its next request or reconnect and immediately terminates its open Local Link WebSocket tunnels. See the full [security model](SECURITY.md) before enabling the gateway.

## Release acceptance checklist

- Pair from a clean browser and arrive at the desktop's selected session.
- Verify live streamed conversation updates and tool approvals.
- Exercise the left drawer, Current session drawer, theme action, session actions, and active-workspace actions.
- Keyboard through each plugin-owned modal and confirm focus enters, loops, closes with Escape, and returns to its trigger.
- Open nested subagents and return to their parent session.
- Confirm the keyboard stays closed when changing sessions.
- Confirm `Add workspace` is absent on every authenticated remote gateway page and remains available on the loopback desktop.
- Check a third-party conversation tab and Cordis panel if installed.
- Test the four viewport sizes above plus one real phone in portrait and landscape.
- Revoke the device and verify its live stream disconnects immediately while subsequent requests and reconnects are rejected.
