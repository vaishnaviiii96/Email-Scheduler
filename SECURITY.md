# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main`  | ✅ Active development and security patches |
| Older branches | ❌ Not maintained |

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email **[vaishnaviiii96+security@gmail.com]** with:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested remediation (optional)

You will receive an acknowledgement within **48 hours** and a resolution update within **7 days**.

---

## Security Controls in This Repository

### 1 · GitHub Native Secret Scanning
GitHub's built-in detector library (200+ patterns — AWS, GCP, Stripe, JWT, SMTP credentials, etc.)
scans every push. Enable in **Settings → Security → Code security and analysis**.

**Push protection** can be enabled to block commits containing detected secrets before they reach
the remote. See [GitHub docs](https://docs.github.com/en/code-security/secret-scanning/about-push-protection).

### 2 · TruffleHog (CI — `.github/workflows/security.yml`)
TruffleHog runs on every pull request and every push to `main`/`master`/`develop`.

| Trigger | Scan scope | Known limitation |
|---------|-----------|-----------------|
| **Pull Request** | `--since-commit <base SHA>` — only commits introduced by this PR | ⚠️ Does **not** scan commits that pre-date the PR base. A secret committed in a past PR and later removed in a follow-up commit is **still present in git history** and will **not** be caught by PR diff scanning. |
| **Push to main / schedule** | Full repo history (`fetch-depth: 0`) + `--only-verified` | ⚠️ `--only-verified` means TruffleHog only reports secrets it can actively confirm are live (e.g. by calling the issuing API). A rotated-but-still-in-history credential that no longer authenticates will **not** trigger an alert, even though the value is still readable in git history. |
| **Weekly schedule** (Sunday 02:00 UTC) | Same as push-to-main | Same `--only-verified` limitation applies. |

#### What "removed from code but still in history" actually means

Deleting a secret from a file and committing the deletion does **not** erase it from git history.
Anyone with `git clone` access can recover it with:

```bash
git log --all -p -- path/to/file | grep SECRET_NAME
```

**Remediation if a secret is confirmed in history:**

1. **Revoke the secret immediately** with the issuing provider (AWS IAM, Google Cloud, Stripe, etc.).
2. Rewrite history with [`git filter-repo`](https://github.com/newren/git-filter-repo) to purge the value:
   ```bash
   git filter-repo --path-glob '*.env' --invert-paths   # nuclear option
   # or target a single string:
   git filter-repo --replace-text <(echo 'ACTUAL_SECRET_VALUE==>REDACTED')
   ```
3. Force-push all branches and ask all collaborators to re-clone — cached forks still hold the old history.
4. Rotate any dependent credentials (DB passwords, OAuth secrets, API keys).

### 3 · Dependabot (`.github/dependabot.yml`)
Weekly automated PRs for:
- `/backend` npm dependencies
- `/frontend` npm dependencies
- GitHub Actions versions

Dependabot alerts for known CVEs are enabled separately in repo Settings.

### 4 · npm audit (CI)
Runs `npm audit --audit-level=high` for both backend and frontend on every PR and push.
Fails the build on **High** or **Critical** severity CVEs.

### 5 · OSV-Scanner (CI)
Scans the full dependency tree against [osv.dev](https://osv.dev) — a cross-ecosystem vulnerability
database maintained by Google. Findings are reported but do not hard-block the build (advisory only).

---

## Known Limitations & Gaps

| Limitation | Detail | Mitigation |
|-----------|--------|-----------|
| **PR diff scanning misses pre-base history** | TruffleHog on PRs only scans new commits; secrets introduced before the PR base SHA are invisible to it | Weekly full-history schedule scan partially covers this, but only for verified (live) secrets |
| **`--only-verified` misses rotated credentials** | Push/schedule scans skip secrets that fail live verification, even if the raw value is still in git history and readable by anyone with repo access | Treat any secret that has ever touched git history as compromised; revoke proactively, not reactively |
| **npm audit covers only direct + transitive npm deps** | Docker image CVEs, OS packages, and system-level vulnerabilities are out of scope | Consider adding `docker scout` or Trivy if container images are built in CI |
| **No SAST (static application security testing)** | Code-level vulnerabilities (injection, XSS, insecure deserialization) are not currently scanned | Consider adding `semgrep` or `eslint-plugin-security` as a future CI step |
| **Secrets in environment variables at runtime** | `.env` files in `/backend` and `/frontend` are `.gitignore`d but runtime env injection is outside the scope of these scans | Use a secrets manager (e.g. Doppler, AWS Secrets Manager, GitHub Environments) rather than `.env` files in production |

---

## Sensitive Files & `.gitignore` Coverage

The following files are excluded from version control and **must never be committed**:

| File | Contains |
|------|---------|
| `backend/.env` | `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, `SLACK_CLIENT_SECRET`, SMTP credentials |
| `frontend/.env.local` | `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET` |
| `backend/prisma/*.db` | SQLite database (local dev) |

See `.env.example` files in each workspace for required variables.
