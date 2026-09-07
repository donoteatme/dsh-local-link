# DeepSeek Harness compatibility

Local Link touches version-sensitive Harness Host, slot, theme, layout, session,
and Settings contracts. Each supported version is therefore checked directly.

## Compatibility matrix

Last checked on 2026-09-07 with Node.js 22 and Windows using the packed
`dsh-local-link@1.1.0` release source for every row. Versions are newest first.

| DeepSeek Harness | Status | Local Link source | Last checked |
| --- | --- | --- | --- |
| `0.1.2-rc.1` | **Supported release** | `1.1.0` | 2026-09-07 |
| `0.1.1-rc.2` | **Verified** | `1.1.0` | 2026-09-07 |
| `0.1.1-rc.1` | **Verified** | `1.1.0` | 2026-09-07 |
| `0.1.0-rc.8` | **Verified** | `1.1.0` | 2026-09-07 |

Versions older than `0.1.0-rc.8` are untested and unsupported.

### Status meanings

- **Supported release** is the current development target and receives the
  complete repository and installed-runtime gate.
- **Verified** means the current packed Local Link release passed the historical
  RC gate on that exact version.
- **Untested** means no compatibility claim is made.

Every newer Harness version still requires an independent check; support for
`0.1.2-rc.1` does not imply support for a moving `next` tag or later alpha.

## Verification policy

The historical RC gate starts from a fresh isolated installation. The packed
release must compose into the Web profile, boot in the real client, render Local
Access, preserve the private-LAN and loopback-admin boundaries, complete one-use
pairing, proxy authenticated HTTP and a supported WebSocket, close that socket
on revoke, reject the revoked device, and activate the responsive shell at
`390 × 844`. Automated tests cover Current session, subagent, locale, slot, and
composition contracts.

All four rows passed with `1.1.0`. The `0.1.2-rc.1` baseline additionally covered
native browser authentication, the loopback-only Settings RPC, a live Current
session, and the Current session and subagent browser surfaces.

Historical RC runs used empty profiles, so they did not create provider-backed
conversations. Physical-phone portrait and landscape acceptance also remains a
separate release check.

A successful package installation alone is not compatibility proof. Harness
may change authentication, DOM semantics, client slots, exported primitives,
theme storage, or responsive geometry while the plugin still appears to boot.
