# Security model

## Intended deployment

- Harness remains on `127.0.0.1:3080`.
- The local-access gateway listens on a private LAN interface through `0.0.0.0:3088`.
- The operating-system firewall limits the listener to private networks.
- The router does not forward the port to the internet.

## Protected assets

A connected Harness browser may read project data, submit prompts, approve actions, and trigger commands. A gateway credential therefore grants powerful access to the current Harness instance.

Mobile View does not reduce that authority. It inherits the selected Harness session's Read only, Workspace write, or Full access mode. Omitting the remote `Add workspace` directory picker is a usability constraint, not an authorization boundary.

## Implemented controls

- Source-address classification for loopback, RFC1918 IPv4, link-local IPv4, IPv6 ULA, and IPv6 link-local ranges.
- Startup rejection for listener addresses outside `0.0.0.0`, private ranges, and loopback ranges.
- IP-literal Host allowlist derived from current private interfaces.
- One-use, expiring pairing tokens.
- 256-bit device credentials.
- Hashed credentials at rest.
- `HttpOnly` and `SameSite=Strict` device cookie.
- Device expiry and explicit revocation.
- Authentication before HTTP proxying and WebSocket upgrade.
- Separation of the Local Link device credential from Harness browser-authentication cookies during proxying and the native browser-token exchange.
- Gateway-side block for desktop administration paths.
- Structural loopback source, Host, and Origin validation for every desktop administration request; lookalike DNS names fail closed.
- Gateway authorities declared through the stock connection `trustedHosts` contract without claiming loopback identity.
- Gateway enforcement that keeps Settings, credentials, native Host actions, and agent-preset authoring outside both Local Link access modes even though the RC connection transport authenticates methods uniformly.
- Bounded local diagnostics with an explicit context allowlist and no credentials, addresses, identifiers, names, paths, or user content.
- No external relay, telemetry, analytics, or remote log collector.

## Diagnostic data

Diagnostics are enabled by default because a local networking plugin otherwise becomes difficult to support after publication. They remain on the Harness computer in `~/.dsh/local-link/diagnostics.json` unless configured otherwise. The default ring retains only the latest 15 failures; successful operations are not recorded. The desktop Settings page is the only UI/API surface for reading, copying, and clearing them.

The report is designed to be safe to review and attach to a public bug report, but users should still inspect copied JSON before sharing it. Disabling `diagnosticsEnabled` prevents new events from being retained.

## Known limitations of the preview

### Plain HTTP

The initial release does not encrypt LAN traffic. Pairing credentials and Harness traffic can be observed by an attacker who can capture traffic on the local network. Use only on a trusted home network while HTTPS support is under development.

### WebSocket revocation

Revoking a paired device blocks subsequent requests and reconnects and immediately destroys both sides of every open Local Link WebSocket tunnel authenticated by that device. Tunnels belonging to other paired devices remain connected. Connections opened in the explicit `trusted-lan` mode are not associated with paired-device records and therefore are not affected by paired-device revocation.

### Version-sensitive Harness integration

Authenticated LAN trust, browser-authentication handoff, the loopback-only RPC list, remote boot capability filtering, direct Settings navigation, coexistence with the stock Cordis footer action, and responsive AppFrame presentation need small version-sensitive adapters. They do not grant privileged Host administration methods, but a Harness upgrade can add or rename a method, break presentation, or fail closed. Before declaring another Harness version supported, audit the current Remote namespaces, rerun the trust-boundary suite, and manually retest pairing, live conversation streaming, Settings navigation, rename, revoke, Cordis coexistence, mobile workspace/session actions, Current session, subagents, theme switching, and third-party conversation tabs.

### Firewall automation

The plugin does not change Windows Firewall. This avoids surprising system-wide changes, but installation documentation must tell the operator to scope any manual rule to Private networks and the selected port.

### Compromised paired device

Pairing establishes device possession, not user identity. Anyone controlling a paired browser profile inherits its access until the device is revoked or expires.

## Non-goals

- Internet exposure.
- Multi-user accounts or workspace isolation.
- Authorization inside a Harness session.
- A lower-authority mobile mode distinct from the selected Harness session.
- Protection against malware already executing as the desktop user.
- A replacement for TLS, VPN access control, or operating-system firewall policy.

Please report vulnerabilities privately rather than opening a public issue with exploit details.
