# LiftUp free hosting setup

Updated November 4, 2026.

Target repository: https://github.com/ultrakevin143/sirnelmarproj

## Source layout

The repository needs package.json, render.yaml, scripts, frontend, and backend-express at its root. A frontend-only repository cannot run this deployment.

The local frontend already has a separate Git history. Keep it intact. The deployment checkout at artifacts/render-deployment combines the source without copying that nested history, environment files, database backups, dependencies, or generated files.

To refresh the deployment checkout from the main workspace, run:

```powershell
node scripts/prepare-deployment.mjs
```

Review the staged filenames and scan for credentials before committing or pushing. Never upload backend-express/.env or a database dump.

## Render configuration

The included render.yaml defines one Free Web Service. In Render, create a Blueprint from the repository and review that the service plan is Free. It prompts for DATABASE_URL rather than storing the credential in Git.

If creating a Web Service manually, use:

| Setting | Value |
| --- | --- |
| Repository | ultrakevin143/sirnelmarproj |
| Branch | main |
| Root directory | Leave empty |
| Runtime | Node |
| Instance type | Free |
| Build command | npm run build |
| Start command | npm start |
| Health check | /api/health |
| NODE_VERSION | 22 |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| SERVE_FRONTEND | true |
| TRUST_PROXY | 1 |
| DATABASE_URL | Existing Neon connection string entered privately as a Render environment secret |

Use the current database schema unless a separate reviewed environment is intended. The read-only readiness check on November 4 found migrations 001 through 012 applied and no pending migrations. Review this again if the database or migrations change before deployment.

The build installs both dependency lockfiles and prepares the exercise and pose assets before compiling the website. Express serves only frontend/dist/spa; API routes remain protected. The database credential is consumed by the server and is not injected into the frontend build.

## Local production verification

With dependencies already installed:

```powershell
npm run build -- --skip-install
$env:SERVE_FRONTEND = 'true'
$env:HOST = '127.0.0.1'
$env:PORT = '9031'
npm start
```

Keep NODE_ENV unset for local HTTP so the browser can use the development cookie. Render uses NODE_ENV=production with HTTPS and Secure cookies. Remove temporary variables after the local session.

For a clean dependency installation and build, run npm run build without --skip-install. This uses npm ci for the two child packages. Run tests separately in a development installation; the hosted backend installation omits its development-only test dependencies.

## Deployment acceptance checks

- Open the assigned Render HTTPS URL and /api/health.
- Sign in using a test account and verify that protected requests succeed.
- Save a workout set, reload, and confirm its values remain in history.
- Confirm another account sees only its own records.
- Check exercise images, the pose model, and WASM assets load.
- Check an unknown /api route returns an API error rather than the website HTML.
- Test access from mobile data while the development computer is off.
- After the free service sleeps, verify connection recovery. Only read-only health checks retry automatically; workout writes require an explicit retry.

The application allows up to six health requests, each with a ten-second timeout and a one-second pause between attempts. Concurrent connection checks share one request sequence. A server identity mismatch stops account submission immediately. A failed check shows Retry connection, and the public landing page can render while the connection is checked.

## Current status

Deployment source and local checks are being prepared. A public Render service is not yet confirmed. Update this section with the actual service URL and hosted acceptance results after deployment.

## Official references

- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/blueprint-spec
- https://render.com/docs/free
