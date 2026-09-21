# Diagnostics

`dsh-local-link` keeps a small local history of failed connection and UI actions. It exists so an npm installation can be debugged without enabling verbose logs or reproducing the problem under a debugger. It is not telemetry and has no upload path.

## What is recorded

An event is created only when an operation fails or a request is rejected:

- generating a one-time connection code;
- consuming an expired, replaced, reused, or malformed invitation;
- opening the gateway from an unpaired browser or an invalid network/Host boundary;
- reaching the loopback Harness HTTP server or event WebSocket;
- rewriting the authenticated Harness index;
- copying the one-time link;
- renaming or revoking a paired device;
- recovering an unreadable diagnostics file.

Successful starts, requests, pairing, link copies, renames, revocations, and ordinary UI clicks are never recorded. Diagnostics are event-driven: there is no sampling loop, heartbeat, analytics client, or remote collector.

The QR popover separately checks every two seconds whether its visible one-time invitation has been consumed. That short-lived status check runs only while the popover is open and neither reads nor writes diagnostics.

## Retention and I/O

- Default file: `~/.dsh/local-link/diagnostics.json`.
- Default retention: the latest 15 events; configurable from 5 through 200.
- Settings view: the latest 12 events.
- Repeated identical events inside a five-second burst are stored once.
- Opening `Settings → Local access` reads the report once. `Refresh` is the only repeated UI read.
- The file is written only for a retained failure, an explicit clear, or migration away from unreadable/obsolete entries.
- Background event writes use an atomic temporary-file replacement and fail soft; diagnostics cannot take down pairing or proxy traffic. The explicit `Clear` action reports a persistence failure instead of claiming that the on-disk report was removed.

Set `diagnosticsEnabled: false` to stop retaining new events. `Clear` immediately removes the retained history.

## Privacy contract

Every event contains only:

- a random event ID;
- an ISO timestamp;
- `warn` or `error` severity;
- a stable event code;
- optional context restricted to `reason`, `method`, and `requestKind`.

Context strings are stripped of control characters and limited to 80 characters. The store rejects unknown event codes and removes obsolete or malformed entries when it loads.

Reports never contain pairing tokens, cookies, credentials, IP addresses, device or session IDs, device names, URLs, request paths, exception messages, stack traces, prompts, conversations, workspace names, or project files. Client-side reporting accepts only three fixed error codes and cannot submit arbitrary text.

## Collect a report

1. Reproduce the failed action once.
2. Open `Settings → Local access → Diagnostics`.
3. Click `Refresh` if the panel was already open during reproduction.
4. Inspect the newest code and timestamp.
5. Click `Copy report`.
6. Review the JSON before attaching it to an issue.

The copied report wraps the retained events with a schema version and export timestamp:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-08-28T00:00:00.000Z",
  "events": [
    {
      "id": "generated-event-id",
      "at": "2026-08-28T00:00:00.000Z",
      "level": "error",
      "code": "HTTP_UPSTREAM_ERROR",
      "context": { "requestKind": "root" }
    }
  ]
}
```

## Event reference

| Code | Trigger | First check |
| --- | --- | --- |
| `PAIRING_GENERATION_FAILED` | `Generate another code` could not produce an invitation or QR image. | Confirm the desktop Harness process is healthy, then retry once. |
| `PAIRING_REJECTED` | The invitation was expired, replaced, or already consumed. | Generate a new code; each invitation is one-use. |
| `PAIRING_INVALID` | The phone submitted malformed pairing data or device state could not be saved. | Generate a new code; if it repeats, inspect file permissions for `~/.dsh/local-link/`. |
| `REQUEST_REJECTED` | Source-address or `Host` validation rejected the LAN request. | Confirm both devices use the same private network and the QR URL contains the computer's current private address. |
| `AUTH_REQUIRED` | An unpaired browser opened a protected gateway page. | Pair that browser with a fresh QR/link; direct `:3088` access is intentionally rejected. |
| `HTTP_UPSTREAM_ERROR` | The gateway could not reach Harness on `127.0.0.1:3080`. | Confirm `dsh web` is running and `upstreamOrigin` matches its port. |
| `BROWSER_AUTH_HANDOFF_FAILED` | Harness returned an invalid browser-authentication handoff target. | Confirm the installed Harness version is supported and restart `dsh web`. |
| `INDEX_REWRITE_ERROR` | The returned Harness index did not match the supported boot contract. | Confirm the installed Harness version satisfies `engines.dsh` and restart `dsh web`. |
| `WS_REJECTED` | A WebSocket upgrade failed trust, authorization, or path validation. | Re-pair the browser and verify no proxy rewrites the URL. |
| `WS_UPSTREAM_ERROR` | The gateway could not open the loopback Harness event socket. | Confirm the desktop Harness process is still running and reload the paired browser. |
| `CLIPBOARD_COPY_FAILED` | The browser refused or failed to copy the one-time link. | Grant clipboard permission or select and copy the displayed link manually. |
| `DEVICE_REVOKE_FAILED` | A requested device revocation failed. | Refresh the device list and retry; inspect local state-file permissions if it repeats. |
| `DEVICE_RENAME_FAILED` | A requested device rename failed. | Refresh the device list and retry with a non-empty name. |
| `DIAGNOSTICS_STATE_RESET` | The previous diagnostics file was unreadable and was replaced safely. | Usually no action; inspect disk health or permissions if it returns. |

## Maintainer rules

- Record failures and rejections only; do not add success or lifecycle noise.
- Add a stable code instead of persisting exception messages.
- Add context only through `SAFE_CONTEXT_KEYS` in `src/diagnostics.ts`.
- Never add request headers, URLs, filesystem paths, identifiers, user-entered text, or user content.
- A diagnostics write failure must never block pairing or proxy traffic.
- Update this reference and the privacy/retention tests whenever an event changes.
