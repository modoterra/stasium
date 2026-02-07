# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Stasium, please report it
responsibly. **Do not open a public GitHub issue.**

Email: **security@modoterra.com**

Include:

- A description of the vulnerability
- Steps to reproduce or a proof of concept
- The potential impact

We will acknowledge receipt within 48 hours and provide an estimated timeline
for a fix. We ask that you allow us reasonable time to address the issue
before any public disclosure.

## Supported Versions

Security updates are provided for the latest release only.

| Version | Supported |
|---------|-----------|
| Latest  | ✅        |
| Older   | ❌        |

## Scope

Stasium runs as a local daemon communicating over a Unix Domain Socket. The
primary attack surface is local privilege escalation. The daemon is designed
to run rootless; any behavior that allows escalation beyond the invoking
user's permissions is considered a security issue.
