# Contributing

Contributions are welcome when they preserve the project's narrow local-access scope and security boundary.

## Set up

```powershell
git clone https://github.com/donoteatme/dsh-local-link.git
Set-Location dsh-local-link
corepack pnpm install --frozen-lockfile
npm run verify
```

## Pull requests

Before opening a pull request:

1. Keep user-visible copy in matching `src/locales/*.json` dictionaries.
2. Add tests for security-sensitive and version-sensitive behavior.
3. Explain every new runtime dependency and why Node or Harness cannot provide the capability.
4. Update the relevant architecture, security, diagnostics, or Mobile View documentation when a boundary changes.
5. Run `npm run verify` and report any browser acceptance that could not be performed.
6. Keep machine paths, device state, credentials, transcripts, and generated caches out of commits.
7. When adding a diagnostic event, keep it failure-only, use a stable code, update `docs/DIAGNOSTICS.md`, and extend the privacy or retention tests.

Remote relays, public tunnels, native applications, device fingerprinting, telemetry, and replacement chat interfaces are outside the project scope unless that boundary is explicitly reconsidered first.

## Releases

Run `npm run release:check` for verification, the production dependency audit, and an npm publication dry-run. After review and explicit release authorization, use `npm run release:publish`; the GitHub release workflow uses the same command.

The publisher explicitly supplies the English README to npm and restores `package.json` after the command finishes, including failures. All localized READMEs stay in the archive. Direct `npm publish` from an unprepared checkout is rejected by `prepublishOnly`, because `readmeFilename` alone does not prevent npm from selecting a translated README.

AI-assisted contributions are welcome. Disclose material agent assistance in the pull request, review the resulting code, and take responsibility for its behavior, licensing, tests, and security just as for any other contribution.
