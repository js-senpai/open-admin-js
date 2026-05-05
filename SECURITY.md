# Security Policy

Report vulnerabilities privately by opening a GitHub security advisory or emailing the maintainers listed in the repository.

Security defaults in OpenAdminJS:

- Admin routes are private except login and password reset.
- Backend permission checks are mandatory.
- Sensitive fields are hidden by default.
- Refresh tokens and API tokens are stored only as hashes.
- Uploads validate size, MIME type and extension.
