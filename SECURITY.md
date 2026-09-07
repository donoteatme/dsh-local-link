# Security policy

`dsh-local-link` controls access to an agent capable of reading files and executing commands. Please do not publish exploit details in a GitHub issue.

Until a private reporting address is configured, open a GitHub Security Advisory in the repository. Include the affected version, deployment topology, reproduction steps, and expected impact.

The current release uses unencrypted HTTP on the local network. This is a documented limitation rather than a supported internet-facing deployment. See [docs/SECURITY.md](docs/SECURITY.md) for the complete threat model and safe-use boundary.
