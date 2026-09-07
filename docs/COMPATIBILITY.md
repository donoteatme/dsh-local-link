# DeepSeek Harness compatibility

Local Link extends version-sensitive Harness Host, client-slot, theme, layout,
session, and Settings contracts. Compatibility is verified against exact Harness
versions and is never inferred from package installation alone.

## Compatibility matrix

Last checked on 2026-09-07 with Node.js 22 and Windows using the
`dsh-local-link@1.1.0` release source for the current row. Historical rows name
the last Local Link source that was verified with them. Versions are newest first.

| DeepSeek Harness | Status | Local Link source | Last checked |
| --- | --- | --- | --- |
| `0.1.2-rc.1` | **Supported prerelease** | `1.1.0` | 2026-09-07 |
| `0.1.2-alpha.1` | **Historical verification** | `1.0.0` | 2026-08-29 |
| `0.1.1-rc.2` | **Historical verification** | `1.0.0` | 2026-08-29 |
| `0.1.1-rc.1` | **Historical verification** | `1.0.0` | 2026-08-29 |
| `0.1.0-rc.8` | **Historical verification** | `1.0.0` | 2026-08-29 |

Versions older than `0.1.0-rc.8` are untested and unsupported.

### Status meanings

- **Supported baseline** is the Harness version used for current development
  and the complete repository verification gate.
- **Supported prerelease** is an exact Harness prerelease included in the
  release gate without implying compatibility with later alpha builds.
- **Historical verification** records the last Local Link source whose core LAN,
  pairing, session, and responsive surfaces were checked on that Harness version;
  it is not a compatibility claim for the current `1.1.0` source.
- **Untested** means no compatibility claim is made.

Every newer Harness prerelease still requires an independent check; support for
`0.1.2-rc.1` does not imply support for a moving `next` tag.

## Verification policy

Every new Harness prerelease or release is checked in a fresh isolated
installation. A version is promoted only after the plugin boots, the LAN and
pairing boundary works, the current session opens, and the responsive
navigation, conversation, Current session, and subagent surfaces have been
exercised. The `0.1.2-rc.1` check includes a real installed Web runtime,
end-to-end pairing and native browser authentication through the Ethernet
gateway, RPC-scope enforcement, revoke, and a `390 × 844` browser viewport. It
does not include a physical phone; portrait and landscape checks on a real phone
remain required before promoting it to supported baseline.

A successful package installation alone is not compatibility proof. Harness
may change authentication, DOM semantics, client slots, exported primitives,
theme storage, or responsive geometry while the plugin still appears to boot.
