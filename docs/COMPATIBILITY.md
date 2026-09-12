# DeepSeek Harness compatibility

Local Link touches version-sensitive Harness Host, slot, theme, layout, session,
and Settings contracts. Each supported version is therefore checked directly.

## Compatibility matrix

Last checked on 2026-09-12 with Node.js 22 and Windows using packed
`dsh-local-link@1.1.1` source for every row. Versions are newest first.

| DeepSeek Harness | Status | Local Link source | Last checked |
| --- | --- | --- | --- |
| `0.1.5-rc.2` | **Verified next** | `1.1.1` | 2026-09-12 |
| `0.1.5-rc.1` | **Supported release** | `1.1.1` | 2026-09-12 |
| `0.1.2-rc.1` | **Verified** | `1.1.1` | 2026-09-12 |
| `0.1.1-rc.2` | **Verified** | `1.1.1` | 2026-09-12 |
| `0.1.1-rc.1` | **Verified** | `1.1.1` | 2026-09-12 |
| `0.1.0-rc.8` | **Verified** | `1.1.1` | 2026-09-12 |

Only the exact versions in the matrix are supported or verified. Alpha builds,
including the previously tested `0.1.2-alpha.1`, versions older than
`0.1.0-rc.8`, and future versions reached through a moving dist-tag are
unsupported until they pass a new check.

### Status meanings

- **Supported release** is the current development target and receives the
  complete repository and installed-runtime gate.
- **Verified next** means the exact package version currently published under
  `next` passed the compatibility gate; the moving tag itself is not supported.
- **Verified** means the current packed Local Link artifact passed the historical
  RC gate on that exact version.
- **Untested** means no compatibility claim is made.

Every newer Harness version still requires an independent check; support for
`0.1.5-rc.1` does not imply support for a moving `next` tag or later alpha.

## Verification policy

The historical RC gate starts from a fresh isolated installation. The packed
release must compose into the Web profile, boot in the real client, render Local
Access, preserve the private-LAN and loopback-admin boundaries, complete one-use
pairing, proxy authenticated HTTP and a supported WebSocket, close that socket
on revoke, reject the revoked device, and activate the responsive shell at
`390 × 844`. Automated tests cover Current session, subagent, locale, slot, and
composition contracts.

All six exact Harness versions installed the packed `1.1.1` artifact without a
peer conflict and passed an isolated installed-runtime gate: profile composition
and boot, Local Link pairing, the version-appropriate browser-authentication
handoff, authenticated root access, an authenticated supported WebSocket,
immediate socket closure on revoke, and a `401` response when the revoked device
retried. `0.1.0-rc.8`, `0.1.1-rc.1`, and `0.1.1-rc.2` used `/api/events.mux`;
`0.1.2-rc.1` and the `0.1.5` builds used the current `/api/remote.mux` path.

The `0.1.5` rows compose and boot with the new `main`/`rightbar` AppFrame while
retaining the session header, composer, sidebar, Settings, and overlay slots
used by Local Link. Both exact RCs additionally passed typecheck, all 98
automated tests, production build/package verification, desktop Local Access
rendering, and the responsive shell at `390 × 844` without client exceptions.
The historical versions retain their earlier real-client responsive evidence;
the `1.1.1` patch changes package compatibility contracts and documentation, not
the shipped client or gateway implementation.

Historical RC runs used empty profiles, so they did not create provider-backed
conversations. Physical-phone portrait and landscape acceptance also remains a
separate release check.

A successful package installation alone is not compatibility proof. Harness
may change authentication, DOM semantics, client slots, exported primitives,
theme storage, or responsive geometry while the plugin still appears to boot.
