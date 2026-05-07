# Security Policy

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Instead, report privately via one of:

- GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository (preferred).
- Email the maintainer listed in [`MAINTAINERS.md`](./MAINTAINERS.md).

Please include:

- A clear description of the issue and its impact.
- Steps to reproduce or a proof of concept.
- Affected versions / commit SHAs.
- Any suggested mitigation if you have one.

We aim to acknowledge reports within 7 days and to provide a remediation timeline within 30 days. Please give us reasonable time to investigate and patch before public disclosure.

## Scope

This is a local-first, browser-resident app. The following are in scope:

- The standalone web app (`apps/web/`)
- The Chrome extension (`src/`)
- WebMCP tool surfaces and consent flows
- Storage of user-supplied API keys and authorized local-doc folders

Out of scope:

- Vulnerabilities in upstream dependencies (please report to the upstream project; we will track and update).
- Issues that require the user to install untrusted browser extensions or paste arbitrary code into the devtools console.
- Social-engineering attacks against end users.

## BYOK and Data Handling

This project is BYOK (bring your own key). API keys for Gemini, OpenAI, and Anthropic are stored only in the user's browser (browser-local settings storage / IndexedDB). The project does not collect, transmit, or store user keys or board content on any server we operate.

If you discover a code path that exfiltrates keys, board content, or local-doc contents to an unintended destination, please report it as a security issue.

## Disclosure

Once a fix is available, we will:

1. Publish a patched release.
2. Credit the reporter in the release notes (unless they prefer to remain anonymous).
3. Open a public advisory describing the issue and remediation.
