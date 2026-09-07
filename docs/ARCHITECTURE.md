# Architecture

## Goals

`dsh-local-link` provides one narrow capability: open the existing DeepSeek Harness Web application from a browser on the same private network. The plugin should remain easy to audit, translate, install, and remove.

The architecture follows six constraints:

1. Keep the stock Harness listener loopback-only.
2. Put the network boundary in a dedicated Host-side gateway.
3. Use Cordis lifecycle and Harness slots for all rendered UI; isolate the settings-navigation compatibility bridge not covered by a public Harness service.
4. Make automatic QR pairing and paired-device state explicit and revocable.
5. Keep presentation text outside implementation code.
6. Keep support diagnostics local, bounded, structured, and free of credentials or user content.

## Components

### Responsibility map

| Module | Single owned boundary |
| --- | --- |
| `src/plugin.ts` | Cordis lifecycle and loopback administration routing |
| `src/gateway/admin-auth.ts` | Structural loopback source, Host, and Origin validation |
| `src/gateway/local-gateway.ts` | LAN listener and authenticated HTTP/WebSocket transport orchestration |
| `src/auth/*` | Pairing-token and persisted device-credential state |
| `src/diagnostics.ts` | Bounded, privacy-filtered failure history |
| `src/client.tsx` | Desktop Local access/Settings surfaces and client registration |
| `src/mobile-layout.tsx` | Responsive activation and stock AppFrame composition |
| `src/mobile-session-info.tsx` | Current-session projection and drawer |
| `src/mobile-subagents.tsx` | Native subagent catalog projection and sheet |
| `src/mobile-dialog.ts` | Shared modal focus, keyboard, and focus-restoration lifecycle |

State stores, transport, diagnostics, responsive orchestration, and individual mobile features remain separate. The larger TSX modules are feature compositions plus scoped CSS; they do not own gateway state, duplicate Harness session state, or perform their own transport.

### Host plugin

`src/plugin.ts` owns lifecycle integration. It starts the gateway, registers a loopback-only administration route on the existing Harness Web server, and closes both registrations with the Cordis effect.

`src/gateway/admin-auth.ts` owns the administration route's source, Host, and Origin boundary. It parses authorities structurally and accepts only actual loopback IP literals or `localhost`; DNS names that merely begin with `127.` or `localhost` fail closed.

### LAN gateway

`src/gateway/local-gateway.ts` owns the only non-loopback listener. It performs request-boundary validation, pairing, device-cookie authorization, and HTTP/WebSocket proxying.

Configuration accepts only the wildcard `0.0.0.0` or an explicit private/loopback listener address. The gateway independently rechecks the request source and exact IP-literal Host authority, so an unsafe public bind cannot be introduced accidentally through configuration.

After authentication, the gateway forwards the browser's original `Host`, `Origin`, referrer, and fetch-site headers to the loopback Harness listener. The Cordis profile patch supplies the gateway's current LAN authorities to the official connection module through its public `trustedHosts` option. Ordinary Harness API and WebSocket traffic can therefore pass the declared origin check without pretending to be loopback.

Harness `0.1.2-rc.1` requires a native browser-authentication exchange. After Local Link pairing succeeds, the plugin asks the injected Harness connection service for an authenticated URL at the gateway origin, validates that the result stays on that origin, and lets the stock root consume the short-lived token. The gateway forwards Harness authentication cookies but strips its own device cookie before proxying, so the two credentials remain independent. Older supported builds that do not expose this service keep the direct-root redirect.

Harness `0.1.2-rc.1` authenticates the connection transport as a whole and no longer applies the older method-specific loopback tier. To preserve Local Link's established scope, the LAN gateway rejects the former privileged configuration, credential, native Host-action, and agent-preset-authoring RPCs before proxying. This applies equally to `pairing` and `trusted-lan`; enabling `trusted-lan` never grants those Host administration operations. `tests/trust-boundary.test.ts` exercises the RC Host/Origin and browser-authentication fence, while `tests/gateway.test.ts` pins the Local Link RPC restriction including the renamed RC Settings methods and encoded-path handling.

### Authentication state

`src/auth/pairing.ts` keeps short-lived, one-use pairing tokens in memory. They disappear on restart and are never persisted.

`src/auth/device-store.ts` persists device records atomically. A browser receives a 256-bit random credential; the file stores only its SHA-256 hash. Revocation deletes the corresponding record, which immediately invalidates future HTTP requests and WebSocket upgrades.

### Diagnostics

`src/diagnostics.ts` persists a versioned ring of structured failure events. The default cap is 15 entries. Successful starts, requests, pairing, renames, revocations, and button clicks do not enter the ring. Context fields pass through a fixed allowlist; arbitrary objects and sensitive identifiers cannot enter the report even if a future call site tries to add them. Writes are atomic and deliberately fail soft so a diagnostics filesystem problem cannot take down local access.

The loopback administration route exposes list, clear, and a narrow allowlisted client-error endpoint only to the desktop UI. The endpoint accepts stable codes for clipboard, rename, and revoke failures; it cannot accept arbitrary messages or context. Nothing is uploaded, and the LAN gateway blocks the administration prefix. The Settings report includes timestamps, severity, stable event codes, and short operational categories—not tokens, cookies, IP addresses, device or session IDs, names, URLs, request paths, prompts, conversations, or project data.

### Client plugin

`src/client.tsx` registers two normal Harness contributions: a compact desktop `sidebar.footer.action` that shows a QR code and copyable one-time link, and a desktop-only `settings.section` that manages paired devices and the local diagnostic report. It does not replace the root layout. The desktop surfaces use plugin-owned classes and semantic selectors; version-sensitive stock-DOM hooks are isolated in `src/mobile-layout.tsx` and documented below.

The `0.1.2-rc.1` browser graph is a normal Cordis `Context`. Session state comes from `@deepseek-ai/dsh-api-session-controller/client`; React slot hooks are supplied by `@deepseek-ai/dsh-client-ui-session/client`, and slot ownership/rendering comes from `@deepseek-ai/dsh-client-ui-renderer/client`. Agent-preset display reads `SessionSummary.projectionValues.agentPreset`, while subagent types come from `@deepseek-ai/dsh-subagent/client`. The removed `@deepseek-ai/dsh-client-runtime` aggregate is neither injected nor imported.

The Harness `sidebar.footer.action` contract is a list, but the supported Web client renders that list as a horizontal flex row while the stock Cordis action reserves `width: 100%` with `flex: none`. Without a compatibility rule, Cordis reduces later actions to zero width. Local Link orders its entry first and changes only the footer container that semantically contains `.dsh-local-link-footer` into a vertical stack. The same scoped rule normalizes the list gap and removes the following action's private top margin so Local access, Cordis, and Settings keep one visual rhythm. The selector is anchored on the plugin-owned class and accounts for the slot renderer's `display: contents` wrapper; it never names a generated Harness class.

The connection card is fixed to the viewport and positioned from the rendered Local access action. On desktop it opens just beyond the sidebar edge and remains vertically centered. Its final QR-state height is reserved before the pairing request resolves, so loading the QR cannot move the card after its first visible frame. On narrow or short viewports it is clamped to a 12 px viewport gutter and scrolls internally instead of moving footer actions or covering them.

Harness keeps settings open state and section selection private inside its shell; the public `openSection` callback is not a general navigation service. The popover's `Paired devices` shortcut therefore uses one bounded compatibility bridge: it clicks the semantic settings dialog trigger and then the nav row matching this plugin's own localized section label. The bridge uses no generated class names, mutates no DOM, and can be removed when Harness exposes a general settings-navigation service.

The Host plugin exposes the running gateway authorities as a Cordis service. `cordis.patch.yml` merges that service with `webRuntime.trustedHosts` before the stock connection module starts. Trust is therefore declared once on the Host; client code neither mutates `connection.isLoopback` nor carries an authentication marker.

Plain HTTP on a private IP is not a browser secure context, while the stock Harness RPC client calls `crypto.randomUUID()` during connection startup. The rewritten index therefore installs a small RFC 4122 v4 fallback backed by `crypto.getRandomValues()` before the stock boot manifest executes. This avoids certificate installation while keeping the LAN-only setup functional.

### Responsive Harness AppFrame

`src/mobile-layout.tsx` is mounted through the normal client plugin and activated by `matchMedia('(max-width: 834px)')`. Crossing the viewport boundary mounts or disposes one scoped set of enhancements. The gateway does not inspect user agents, parse `view` parameters, set layout cookies, load a second bundle, or alter the root-layout boot entry.

The shipped Harness root and AppFrame continue to own `sidebar`, `conversation`, `details`, and `shell.overlay`. Local Link contributes only additive overlay, session-information, and subagent surfaces, then applies scoped responsive geometry to the existing frame. It never enumerates Chat, Trajectory, composer, dock, node, or third-party registrations, so those continue to resolve through the native dynamic slots.

The existing `layout` controller opens and closes the stock sidebar. Responsive styles project that sidebar and the plugin's details surface as dismissible drawers, preserve overlay contributions, apply safe-area insets, and keep dynamic tab lists horizontally scrollable. At wider viewports the enhancement fiber is disposed and the untouched desktop presentation remains.

Plugin-owned modal drawers share `src/mobile-dialog.ts`: opening moves focus into the surface, Tab and Shift+Tab remain inside it, Escape closes it, and closing restores focus to the invoking Harness control. This behavior is isolated from session and gateway state.

The stock Settings dialog is intentionally not exposed inside the narrow mobile drawer. The responsive enhancement shadows the official single `sidebar.settings` occupant with one compact sun/moon button. Its icon and accessible label describe the next action. It reads the resolved `ctx.theme.getTheme().active.colorScheme`, so a `system` preference follows the operating-system theme on first render, subscribes to the normal `theme/change` event, and writes an explicit choice only through `ctx.theme.setTheme('light' | 'dark')`.

The compact appearance button is visually placed in the stock sidebar brand row without becoming part of the Harness brand action. A scoped mobile geometry rule changes the stock flexible brand button to a content-sized hit area and leaves the remaining row space to the separate appearance and sidebar-toggle controls. This keeps all three hit areas disjoint while preserving Harness's own buttons, actions, focus behavior, and tap highlight. Harness exposes no sibling slot in this row, so the compatibility rule identifies the stock CSS-module button by its semantic `_brand` class suffix; Harness upgrades must verify that hook.

Theme persistence remains entirely owned by Harness. A phone can change the theme for its current page, but reload returns to the durable Host preference—often `system`, which is then resolved using the phone's own color scheme. Local Link does not impersonate a loopback client and does not add a competing cookie or browser-storage preference. Persistent per-device theme selection requires a safe client/device preference scope from Harness.

The authenticated gateway manifest omits Harness's host directory-picker client capability. The stock WorkspaceBrowser already treats `sidebar.workspaces.directoryFlow` as optional, so it naturally keeps Search, View options, existing workspaces, and sessions while withholding `Add workspace` from every remote gateway viewport. In alpha manifests the same entry is removed from the batch activation list without rewriting the server-registered batch URL. Loopback desktop boot entries are unchanged; no DOM selector or duplicated workspace browser is involved.

Subagent controls also stay inside the native graph. A mobile-only list entry in `conversation.input.dock` projects the existing `useSessions` catalog into a compact status chip above the composer. The sheet itself is an additive `shell.overlay` entry, while a higher-priority mobile occupant of `conversation.session.header.lineage` removes the desktop dropdown without replacing the session header. Opening and expanding the sheet uses `ctx.sessions.setSubagentCatalogOpen`; selecting a row uses `ctx.sessions.openSubagent`. Closing the sheet or a tree branch releases every corresponding catalog observation. There is no second session store, WebSocket, or data-polling loop. While the sheet is visible, one one-second presentation clock updates displayed activity durations from the already-observed catalog and is cleared when the sheet closes.

### Localization

JSON dictionaries under `src/locales/` are registered with Harness `LocaleRuntime`. The slot declares its locale namespace and receives the framework translation function. The application locale remains the single source of truth.

The automatic pairing page runs before the Harness client and locale service load. Its small copy subset is sourced from those same JSON dictionaries at build time and selects English or Chinese from `navigator.languages`; it has no separate translation files or network request.

### Design-system boundary

Local Link uses Harness semantic color, state, border, background, elevation, and typography variables wherever the supported client exports an applicable token. Icons are imported from `@deepseek-ai/dsh-client-ui-primitives` when that package exposes the required glyph, and stock Harness menus, dialogs, conversation actions, Settings surfaces, and session operations that Local Link does not replace remain their native components. Literal colors following a `var(--dsw-*, fallback)` expression are defensive fallbacks and are not selected in the supported Harness build. The context breakdown's purple tools segment intentionally matches the stock Harness `ContextMeter` implementation exactly.

Harness `0.1.2-rc.1` does not expose a complete public responsive-shell or Drawer contract, spacing scale, radius scale, or mobile component recipes. Mobile geometry—safe-area placement, drawer widths, tap-target dimensions, spacing, radii, and transition timing—therefore remains plugin-owned CSS. One plugin-scoped `--dllm-side-drawer-width` value keeps the stock sidebar projection, the right details surface, and Current session visually identical instead of duplicating width literals. A small set of concepts also has no exported Harness primitive: Local access/device, navigation, current-session information, permission variants, and the subagent group glyph. The compact feedback-note affordance is a scoped presentation adapter because the stock feedback action accepts text only and exposes no icon-mode contract.

All plugin-owned button and text-input controls use the exported Harness `Button` and `Input` primitives. Their semantic variants (`primary`, `outline`, `ghost`, and `toolbar`) remain owned by Harness; Local Link adds only the geometry required by its composed surfaces, such as a full-width sidebar row, a segmented copy action, a scrim, or a tree row. A source-level test rejects new raw `<button>` and `<input>` elements in the plugin UI.

Component-level alignment remains bounded by the contracts Harness actually exports. The responsive shell, side drawer, bottom sheet, QR composition, context card, and diagnostics disclosure have no equivalent complete public responsive component contract in `0.1.2-rc.1`, so their structure remains semantic HTML plus scoped CSS. They use Harness tokens and primitive controls internally and should migrate if Harness later publishes compatible responsive components.

These are compatibility surfaces, not an independent theme. Every Harness upgrade must compare them against the current token vocabulary, primitive icon catalog, slot contracts, and stock mobile behavior. They should be deleted in favor of upstream tokens or components as soon as equivalent public contracts exist.

English and Chinese dictionaries intentionally contain the same key set. `tests/locales.test.ts` makes this a release invariant. Adding a language means adding one matching dictionary, registering that locale ID in `src/client.tsx`, and mapping its small pre-client subset in `src/gateway/pair-page.ts`; feature component code remains unchanged.

## Stable UI contract

- Opening the sidebar panel issues one invitation represented by the same QR code and copyable link.
- The client shows the server-issued expiry countdown; generating another code invalidates the previous invitation before replacing it.
- While the panel is open, its loopback-only status check closes the invitation UI as soon as the Host reports that the token was consumed.
- Pairing is automatic and opens the desktop-selected session.
- The settings surface owns device visibility, display-name editing, revocation, and the bounded local diagnostic report.
- Listener address, access mode, and retention remain configuration, not separate end-user controls; the reachable address is already part of the one-time link.

This boundary keeps connection setup in one place and persistent access management in one place without turning the plugin into a network-control dashboard.

### Diagnostic event flow

1. A failed user action, rejected request, or broken proxy boundary emits a stable `warn` or `error` code. Successful operations emit nothing.
2. `DiagnosticStore` discards every context key outside `reason`, `method`, and `requestKind`, coalesces identical five-second bursts, retains at most 15 events by default, and persists atomically.
3. The desktop-only administration route returns newest-first events. Opening Local access reads it once; only the explicit `Refresh` action reads it again.
4. Settings renders the newest 12 events and can copy all retained events as an issue report or clear the store. No diagnostics timer, background upload, analytics SDK, or remote endpoint exists.

## Request flows

### Pairing

1. The desktop sidebar action reads Harness's current session selection and requests a one-time token from the loopback administration route. Issuing it clears any older unconsumed invitation.
2. The Host builds a LAN URL containing the token and current session in the fragment, then renders the same URL as a QR data URL. Neither value reaches the initial HTTP request.
3. The phone opens a minimal automatic connection page. The secret remains in the URL fragment and is not sent in the initial HTTP request.
4. The page immediately POSTs the token with a coarse device category and browser name; there is no confirmation form and no fingerprinting.
5. The gateway consumes the token, stores a credential hash, and sets the Local Link browser cookie.
6. The desktop's loopback-only status check observes the consumed token and closes the QR panel.
7. Before booting Harness, the page writes the selected session into Harness's own `dsh.sessions.current` persisted-selection cell for the LAN browser origin.
8. The browser continues through the native Harness browser-authentication handoff when the installed version requires it, then redirects to the complete stock Harness root. Harness loads the shared server-side session list and opens the transferred current conversation, whose ordinary WebSocket stream shows live agent activity.

### Normal request

1. Reject requests not originating from a private or loopback address.
2. Reject a `Host` that is not one of the machine's current private IP literals and configured port.
3. Reject the gateway administration prefix.
4. Validate the paired-device cookie unless `trusted-lan` was explicitly configured.
5. Reject the established loopback-only RPC set, including the RC Settings method names.
6. Proxy all remaining traffic to the loopback Harness listener.

### WebSocket upgrade

The same network, Host, and credential checks run before an exact supported stream path is passed to the upstream server. The compatibility allowlist contains `/api/events.mux`, `/api/events.host`, and the current `/api/remote.mux`; query-bearing and arbitrary WebSocket paths remain rejected. In `pairing` mode, the gateway retains an in-memory association between each upgraded tunnel and the paired-device ID that authorized it. Revocation destroys both sides of every tunnel for that ID after removing the credential, without disconnecting other devices. `trusted-lan` tunnels have no paired-device identity and remain outside this lifecycle.

## Dependency policy

Runtime dependencies are intentionally limited:

- `@deepseek-ai/schemastery`: Cordis-compatible configuration schema.
- `qrcode`: QR rendering for the desktop sidebar panel.

HTTP forwarding and the supported Harness event WebSocket tunnels use Node's built-in `node:http` and `node:net` modules. No general-purpose proxy package is shipped.

No service discovery, certificate generator, tunnel client, native application, analytics SDK, remote log collector, or extension runtime is included.

## Compatibility strategy

The plugin develops against the exact DeepSeek Harness `0.1.2-rc.1` contracts. Most integration uses declared package contracts, but several adapters are intentionally version-sensitive:

| Adapter | Why it exists | Failure behavior | Removal condition |
| --- | --- | --- | --- |
| Connection `trustedHosts` profile patch | Authenticated non-loopback pages need an explicitly declared LAN authority for ordinary API and WebSocket traffic. | An undeclared authority is rejected before browser authentication. | Harness exposes a first-class authenticated-gateway registration contract. |
| Browser-authentication handoff | `0.1.2-rc.1` requires a native one-time browser token in addition to Local Link device pairing. | An absent or invalid handoff fails closed and records `BROWSER_AUTH_HANDOFF_FAILED`; older builds without the service keep their direct-root path. | Harness publishes a stable authenticated-gateway handoff contract across releases. |
| Loopback-only RPC filter | The RC connection transport authenticates all methods uniformly, while Local Link must preserve its narrower pre-RC remote scope. | Configuration, credential, native Host-action, and agent-preset-authoring methods return `403` from the LAN gateway in both access modes. | Harness exposes a server-side authenticated-gateway capability policy with an equivalent restriction. |
| Remote boot capability filter | The native directory picker targets the Host filesystem and is misleading from a remote browser. | If the known picker entries change, `Add workspace` can reappear; server authorization remains unchanged. | Harness exposes a remote-client capability policy. |
| Settings navigation bridge | The shell keeps `openSection` private outside onboarding. | The shortcut does nothing; ordinary `Settings → Local access` remains available. | Harness exposes general settings navigation. |
| Footer stack rule | Cordis reserves a full-width cell inside a horizontal list container. | Without it, Local access has zero width while Cordis is mounted. | Harness stacks full-width footer actions or gives entries an explicit layout contract. |
| Remote theme persistence | Remote clients have no durable per-device theme preference. | An explicit mobile light/dark choice resets on reload to the host preference, commonly `system`. | Harness exposes a safe per-client or per-device preference scope. |
| Responsive AppFrame adapter | Harness exposes its root, layout controller, semantic tokens, and button/input primitives, but no public responsive-shell recipe, spacing/radius scale, several required glyphs, or icon mode for the feedback note action. | Token, component, or stock DOM/action changes can degrade mobile presentation while business operations remain intact. | Harness publishes responsive contracts and glyphs for the remaining plugin-owned surfaces. |
| Mobile stock-DOM touch adapters | Harness has no touch-visible contract for session/workspace overflow actions, a separately slotted brand-row action, or compact feedback-note mode. | A CSS-module or stock DOM change can hide an action or enlarge its hit area while the underlying Harness operation remains available. | Harness exposes mobile action visibility and brand-row/feedback extension contracts. |

The manifest transformation and scoped adapter invariants have source-level tests. Presentation behavior is verified during browser acceptance against the supported Harness build. Release screenshots come from the live composition with private workspace and conversation content excluded from the frame. Screenshots do not replace live pairing and real-device checks.

## Known pressure points

- **Plain HTTP:** avoids certificate onboarding but offers no confidentiality from other machines able to capture LAN traffic.
- **RPC compatibility list:** the gateway pins the administration methods that must stay loopback-only. New Harness configuration or native Host RPCs require an explicit review before the RC support claim moves forward.
- **Browser metadata:** category and browser are coarse display hints supplied during pairing, not trusted identity. Laptop versus desktop is intentionally reported as `Computer`.
- **Interface selection:** the first private IPv4 address is used in invitations. Multi-interface selection is not exposed yet.
- **Harness upgrades:** directory-picker boot IDs, AppFrame DOM semantics, or connection contracts may change even when TypeScript package contracts still compile.
- **Mobile acceptance:** the responsive AppFrame enhancement preserves dynamic slots by construction, but virtual keyboards, orientation changes, and third-party conversation views still require real-device checks.
- **Design-system drift:** plugin-owned mobile geometry, responsive compositions without exported equivalents, and the few concepts without primitive icons must be visually compared with every supported Harness release.
- **Process lifecycle:** Host-side updates require a Harness restart. Client artifacts may be read from disk on reload, which can temporarily create a mixed-version UI; compatibility normalization prevents old device records from rendering blank.

These are documented constraints, not hidden fallback modes. Release readiness requires the automated gate plus a real browser check of pairing, live conversation streaming, Cordis coexistence, settings navigation, rename, and revoke.
