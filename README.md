# LiftUp

Quasar + Vue 3 + TypeScript frontend, Express API, and PostgreSQL (including Neon).

## Free hosting

See [Free hosting setup](docs/FREE_HOSTING_SETUP.md) for the Render configuration,
production build, deployment checkout, and verification steps. The root `npm run build`
builds the combined website and API deployment; `render.yaml` selects a Free Web Service
and prompts for the Neon connection string privately.

## Run

Install dependencies in `backend-express` and `frontend` with `npm install`. Set the server-only
`DATABASE_URL` in `backend-express/.env`, then run `npm run dev:all` from `frontend`.
Express uses port 3031 by default; Quasar proxies `/api` to it. This avoids common port-3000 conflicts with other local apps. Use the frontend URL printed by Quasar.
Production hosting must serve the frontend and `/api` on the same HTTPS origin.

The API applies versioned migrations on startup. Back up an existing hosted database before a
production upgrade. Migration `010_accounts.sql` adds accounts, sessions and ownership columns;
it does not delete existing workout data.

## Accounts

Create an account through the landing page. Passwords must be 12–128 characters. Passwords are
hashed with salted scrypt; sign-in uses an opaque, seven-day, HttpOnly / SameSite=Strict cookie.
Production cookies also require HTTPS. Sessions are verified server-side, rotated on sign-in,
and revoked on logout. API writes require the `X-LiftUp-Request: 1` header (set by the frontend).
Sign-in/registration are limited to 20 attempts per IP per 15 minutes in this single API process.

Each account has its own weekly plan, active workout, history, custom movements and templates.
New accounts receive the starter split. The old LocalStorage demo profile no longer signs a user in.
Email delivery, verification, password recovery, and distributed rate limiting are not included.

## Training and account improvements (October 20, 2026)

- **Account menu → Account & training settings** edits the profile, changes the password,
  and stores training goals, equipment, days, session length, rep range, load increment,
  and kg/lb display preferences. A password change revokes other sessions. Account
  deletion requires the current password and typing `DELETE`; it deletes only that
  account's data. Email verification and password recovery remain intentionally excluded.
- **Starter setup** offers a preview before replacing the weekly plan. It uses saved
  equipment, training days, session length and targets. Loads start at zero so the lifter
  can choose them. Existing history and saved templates are preserved; an active workout
  must be finished first. Saving preferences alone does not replace a plan.
- **Workout** opens on the local weekday and shows the actual date. Loading, empty and
  failed states are distinct, with persistent retry controls. Optional progression
  suggestions check all working sets, the chosen rep range, load increment and session
  effort. Applying a suggestion only fills the inputs; it never logs a set automatically.
- **Device drafts** preserve active-workout notes, effort, set edits and new-set inputs
  across reloads under an account-and-workout-specific LocalStorage key. Drafts older
  than seven days are not restored. Logged sets remain server-backed. Drafts are not
  synchronized between devices, and there is no automatic offline write queue. Reconnect
  and explicitly retry an unsuccessful save. If device storage is unavailable, the app
  warns before closing a tab with unsaved changes. Drafts on a shared device remain in
  its browser storage until removed; signing out prevents another account from loading them.
- **Finish review** checks unlogged inputs and saves edited sets, notes and effort in
  one database transaction. A recap links directly to the finished workout. Intentionally
  unfinished sets remain marked as planned in history.
- **Exercises** has keyboard-operable guide buttons, equipment filtering, account-scoped
  favorites, and recently used movements. **History** adds search and date filters, local
  action errors, independent chart retry, and repeating a session with all copied sets
  marked incomplete. Repeating is blocked while another workout is active.
- **Progress** supports 30/90/365-day ranges, load, volume, estimated 1RM, best/total reps,
  duration and distance, with a readable data table and dated axes. Bodyweight and timed
  working sets now appear. Duration and distance charts use totals per session; their
  record values use the best individual set. CSV continues exporting canonical kg values.
  The plate calculator explicitly continues using kilograms.

Migration `012_training_preferences.sql` only adds account preferences and a favorites
table. Back up an existing database before rollout, then use the guarded `db:migrate`
command below; it now permits migrations 010–012 and verifies existing training rows.
The new `test/training-features.test.js` covers isolation, preference validation, plan
replacement, atomic finishing, repeat sessions, bodyweight/timed progress, profile edits,
password rotation and deletion. It is included in `npm run test:postgres` as well as the
normal in-memory test suite.

### Pre-account data

Rows from before migration 010 retain NULL ownership and remain in PostgreSQL. They are not
automatically exposed or assigned to the first registrant. Attaching that shared data to a named
account requires a separate reviewed ownership migration. Do not delete those rows or use a
public signup to claim them.

## Training tools

- **Rest chime:** Web Audio produces two short tones when a running interval reaches zero.
  Sound can be muted or tested in the timer. Click/tap to enable audio first. Device volume,
  browser restrictions and sleeping/closed tabs can prevent or delay sound. An expired timer
  restored after reload does not replay an old alert. Timer state is saved per browser tab.
- **Set PR badges:** History labels new load and estimated 1RM records chronologically across
  finished workouts. Only completed working sets with positive load/reps qualify; ties, warm-ups,
  unfinished workouts and planned sets do not. The first eligible set establishes a record.
  Estimated 1RM uses Epley for 2–12 reps and actual load for one rep. Editing/deleting a set
  recalculates badges. Starter movements on different plan days match by normalized name;
  catalog and custom library movements match by their exercise ID.
- **Plate calculator:** Enter total kg including a 20 kg bar. It returns plates per side, largest
  first, using 20/10/5/2.5/1.25 kg plates. It assumes sufficient pairs and excludes collars.
  Unattainable totals are rejected instead of silently rounded.
- **CSV history export:** History → Export CSV downloads only the current account's complete
  training log, including planned/unfinished rows with explicit status. Each set is a row with
  kg, reps, seconds, metres, set type, completion, PRs and notes; timestamps use UTC. Empty
  sessions remain represented. UTF-8 BOM, CSV quoting and formula neutralization support
  spreadsheet use.

## Verification

### October 26 reliability and arrangement improvements

- History opens on **Workout log**, with a separate **Training insights** view for weekly
  rhythm, exercise trends and records. Switching views keeps search/filter state. View details
  and Repeat workout share an action row instead of squeezing into the date column.
- The eight-week **Your training rhythm** view counts distinct local training days against
  the saved weekly target. Empty, unfinished, future and warmup-only sessions do not count.
- Completed working sets can earn **Bodyweight reps**, **Duration**, and **Distance** PR badges.
  Bodyweight rep records require explicit 0 kg external load. Ties and warmups are excluded;
  edits/deletions recalculate badges, including CSV exports.
- Warmups no longer satisfy planned working-set targets or make a movement appear complete.
  Mixed-load working sets do not trigger an automatic load-increase suggestion, and high-effort
  repeat suggestions keep the previous rep count.
- Clearing history search no longer causes a null-value error. Settings show invalid targets
  and unsaved edits; starter preview is disabled until edits are saved. First-time setup focuses
  on training, with optional progression targets collapsed and account/security settings available
  in the normal settings view. Leaving with unsaved settings prompts the user.
- The local API defaults to **3031**; `PORT` and `GYMTRACKER_API_URL` can override the API port
  and frontend proxy respectively. Account mutations verify `/api/health` identifies the LiftUp
  service before submitting their payload, preventing accidental account submissions to another
  local project when a port/proxy is misconfigured. No database migration is needed for this pass.

```powershell
cd backend-express
npm test
cd ../frontend
npm test
npm run typecheck
npm run build
```

Backend tests use isolated in-memory PostgreSQL emulation (`pg-mem`) and never connect to Neon.
They cover credentials/session expiry, cookie rotation/revocation, request protection, two-account
isolation (including guessed IDs and exports), migration idempotency, schema transaction handling,
PR recalculation and CSV escaping. Frontend tests cover exact plate loading and timer/chime behavior.
These tests do not substitute for a hosted PostgreSQL deployment check.

### Real PostgreSQL verification

From `backend-express`:

```powershell
npm run db:check
npm run test:postgres
```

`db:check` uses a read-only transaction. It reports pending migrations and aggregate
ownership counts without displaying credentials or individual account/workout data.
It does not start the API, apply migrations or assign records.

`test:postgres` is an explicit opt-in to the database configured by `DATABASE_URL`.
It creates randomly named `gymtracker_test_*` schemas, applies migrations there,
and exercises accounts, isolation, session persistence, transaction rollback and
the legacy-data upgrade. It removes those temporary schemas after each test.
It does not migrate or seed the configured application schema. The database role
must have permission to create schemas. Allow several minutes for a remote Neon
connection; the normal `npm test` remains offline/in-memory.

Do not interrupt the PostgreSQL test process during cleanup. If it is forcibly
terminated, a temporary test schema may remain; review its exact generated name
before removing it. Never remove the application schema or use a wildcard cleanup.

### Local database backup

From `backend-express`, run `npm run db:backup` after installing matching PostgreSQL
client tools. On this Windows workspace, portable PostgreSQL 18.6 clients live in
`.tools/postgresql-18.6/bin`; no PostgreSQL server service is installed. Other setups
can use `pg_dump`/`pg_restore` on PATH or server-only `PG_DUMP_PATH` and
`PG_RESTORE_PATH` environment variables.

The backup command reads `DATABASE_URL` from `.env` and uses the direct Neon endpoint
(removing the documented `-pooler` hostname suffix). For other configurations, set
`DIRECT_DATABASE_URL` server-side. It uses a temporary password file rather than
putting credentials in command arguments, with verified TLS and channel binding.

Backups cover the configured application schema (default `public`), including its
table definitions, data and sequences. They do not contain global database roles or
other schemas. Each backup gets a new `.dump` filename and a JSON manifest with its
SHA-256 checksum. The command verifies the archive directory and reads/decompresses
the full archive without connecting `pg_restore` to any database. This is an archive
readability check, not a test restore into a separate database.

Files are saved under `backend-express/backups/`, excluded from Git along with
`.tools/`. Backups contain private application data: keep them private, copy them
to a secure separate location, and do not upload them to a repository. Temporary
credential files are removed after use. Failed attempts retain `.partial` files
and private error logs, not valid completed backups.

For disaster recovery, use `pg_restore` into a separate empty PostgreSQL database
with a direct connection and `--no-owner --no-acl --exit-on-error`. Verify that copy
before considering any replacement of the live database. Do not use `--clean` or
point recovery commands at the live database without a separate reviewed plan.

References: [Neon backup guide](https://neon.com/docs/manage/backup-pg-dump),
[PostgreSQL binary downloads](https://www.enterprisedb.com/download-postgresql-binaries).

### Guarded accounts rollout

The configured Neon application schema was upgraded through `010_accounts.sql`
on 2026-10-19. Existing shared records were preserved without assigning them to
new accounts. Create your own account in the app; associating pre-account data
requires a separate, reviewed ownership operation.

For another pre-account database, create a fresh backup with `db:backup`, then run:

```powershell
npm run db:migrate -- --backup backups/<new-backup-filename>.dump
```

The guarded command requires a read-verified backup less than one hour old,
matching the configured database/schema fingerprint, filename, size and checksum.
Older backups without a fingerprint remain valid archives but do not satisfy
this command's target guard. It permits only reviewed migrations 010–012, takes transaction/table
locks, checks that the migration version still matches the backup, and compares
canonical row hashes of all eight existing application tables before committing.
Unchanged data and NULL legacy ownership are required. A private migration receipt
is saved alongside the backups. The normal API startup still applies pending
migrations automatically, so use this reviewed command before starting an API
against an existing pre-account database.

### Live development smoke check

Start this project's frontend and API with `npm run dev:all` from `frontend`, then
run from `backend-express`:

```powershell
npm run db:smoke -- --base-url http://localhost:9000
```

This is opt-in and writes disposable data to the configured application database.
Use only this project's local frontend/API connected to the same `.env` database;
do not point it at another service. It creates two random reserved test identities,
checks registration/sign-in/logout, personal plans, concurrent workouts, access
isolation, history and CSV export through the frontend proxy, then deletes only
those identities and their own data. It compares existing application rows before
and after cleanup and saves a private verification receipt. It does not create a
real account for you, send email, or assign the old shared records.

Do not forcibly terminate this command during cleanup. If cleanup fails, review
the exact `liftup-smoke-<run-id>-<a|b>@example.invalid` test identities before taking
any action; never delete real users or use a broad cleanup filter.

### One-time local test account

For this unpublished test project, the user authorized creating a reserved demo
identity and assigning the original shared data to it. The opt-in command is:

```powershell
npm run db:setup-test -- --backup backups/<fresh-backup>.dump --local-test
```

It refuses production mode, any existing account, ambiguous legacy plans, or
multiple active legacy workouts. It requires the same fresh backup/checksum/target
guard as the migration command. Inside a transaction it creates `demo@liftup.test`
with a random scrypt-hashed password and assigns the existing plan/history to it.
It preserves original IDs, dates, notes, set values, and completion states; only
ownership and the personal plan lookup key change. Other unassigned custom
movements/templates are assigned as part of the same original data set.

The generated password is saved only in a private `local-test-account-*.json` file
under the Git-ignored `backend-express/backups` directory. No public demo login,
authentication bypass, automatic password reset, or email delivery is added. The
command verifies login, the original plan ID and all linked history IDs through
the running frontend API proxy, then logs its verification session out. The test
account remains available for manual sign-in using that private credentials file.

Startup no longer seeds another unowned shared plan once an account exists, so
restarting the API cannot recreate an orphan copy after this ownership assignment.

### Experimental push-up camera

Open **Workout → Push-up camera** (`/#/app/camera`) after signing in. Use current
Chrome or Edge at `http://localhost:9000` (or HTTPS when deployed). This is a
single-person push-up rep-estimation prototype, not a form/safety assessor.
**Chest / torso movement** is the default: a visible upper-body proxy follows
vertical travel or apparent shoulder-size changes toward/away from the camera,
without requiring elbow or wrist tracking. The model has no direct chest landmark;
the blue ring uses the shoulder midpoint plus a small image offset, or a point
20% along a visible shoulder-to-hip segment. It does not measure floor distance.
Body rotation, leaning, camera motion and other exercises can cause false counts.

Both modes now require an automatic push-up-position check: show at least one
shoulder, hip and knee. Feet help stabilize the movement reference. Upright/folded
poses, uncertain body context and detected repositioning do not advance the count.
The UI distinguishes position detected, not counting and repositioning. This is a
loose pose/context heuristic, not a certified classifier or a guarantee against
all accidental counts. No calibration hold or separate counting button is required.

Optional **Arm movement** preserves the earlier side/front paths: an elbow and wrist
from the same arm can drive the skeleton up/down fallback without a usable elbow
angle; body context from a shoulder/hip/knee is still required. Perfect alignment, equal arm angles,
and an exact 90-degree bend are not prerequisites. Front view can use estimated
3D elbow angles or fall back to 2D. Missing shoulders activate relative elbow/hand
vertical tracking, which stays selected for the capture to avoid mid-cycle switching.
Other arm bend/return exercises may also count;
it cannot certify that an observed cycle was a correctly performed push-up.

1. Optionally run **Check tracking model (no camera)**. This loads the real model
   and runs a blank-frame inference; it does not request camera permission.
2. Leave **Chest / torso movement** selected, or choose **Arm movement** for the
   earlier elbow-based counter (with Auto / Side / Front choices).
   Choose **Start camera** and allow the browser camera prompt yourself.
   No microphone is requested and no manual position captures are needed.
3. Show a shoulder, hip and knee for the position check. For chest mode, show both
   shoulders or one shoulder and hip; elbows and hands
   can be cropped. The blue ring identifies the estimated upper-body tracking point,
   and the movement meter shows whether a descent/return is being observed.
   For arm mode, show an elbow and wrist.
   No setup or endpoint hold is required: start moving once **Position detected** appears.
   A visible shoulder enables elbow-angle tracking. Keep the laptop and hands still.
   Side/front selection changes the angle-tracking pipeline,
   not whether your body position is judged correct.
4. Counting starts automatically. Lower and return up to add one rep. Reaching the
   bottom alone or initially starting down does not count. Head movement alone is
   insufficient. Brief landmark dropouts are tolerated; sustained loss, a changed
   arm/measurement source, multiple people, pause or a long frame gap discards an
   unfinished rep. Standing or repositioning refreshes the reference, so movement
   into place is not joined to an earlier partial rep. Return up to reacquire automatically.
   **Tracking details** shows the method, frame interval, arm/source and last interruption.
   Slow tracking may miss fast movements between frames.
5. **Stop camera & review**, correct the estimate if necessary, then optionally
   save to your active workout or explicitly start a camera workout. Saving appends
   one completed working set with 0 kg external load; it never replaces existing sets.

Use **New set / reset tracking** before another set or changing the view selection.
Chest mode uses image-height travel of 2.5–6% (scaled from the initial body reference)
relative to a lower-body anchor, or a 15% shoulder-span increase relative to a
visible lower-body span, then return within 40% of that excursion
threshold. It locks one cue through each rep, requires a 500 ms observed cycle,
and refreshes the baseline at the returned position. These are camera heuristics,
not certified depth thresholds or a substitute for a real-person accuracy test.
The position gate uses a loose shoulder/hip/knee alignment and non-upright body
orientation (estimated 3D when usable; image-plane side-view geometry otherwise).
Large lower-body translation, a changed reference, or lower-body scale change
discards the pending cycle. Smaller shared translation/scale is normalized out of
the chest movement signal. Missing knees/hips pause counting rather than treating
shoulders-only movement as a confirmed push-up. Similar floor exercises and
landmark errors remain possible false positives; review every saved count.
The initial arm angle sets relaxed return/bend thresholds (about 30 degrees of
elbow excursion), rather than requiring 155-degree up and 100-degree down poses.
The skeleton fallback instead checks roughly 5.5% of frame-height elbow travel
relative to the hand, then a return within 2%. Moving the hand over 8% of normalized
frame coordinates resets that movement reference. Both paths require an observed
complete cycle lasting at least 400 ms; frame gaps over 2.5 seconds disarm it.
Holding the top position does not satisfy that minimum: timing follows the latest
observed top position so a brief down/up tracking spike after a rest is rejected.
Finite geometry, modest confidence and separated movement thresholds filter some noise.
These are heuristics, not individualized depth prescriptions. Review before saving;
real camera accuracy depends on
framing, lighting and landmark quality.

The camera starts only on request and stops on navigation, tab hiding, disconnect,
or tracking failure. Video/pose points stay in memory in this browser; no recording
or frame uploads are implemented. Only your reviewed rep count and a retry key are
sent to the authenticated API. Retrying a save uses the same key to avoid duplicates.
Check the workout before clearing a capture after an interrupted save response.
An unchanging preview, stalled frame capture or unresponsive inference stops the camera
after five seconds. Late frame captures are closed and cannot restart a stopped capture.

`predev`/`prebuild` prepare local WASM assets from pinned MediaPipe Tasks Vision
1.1.1 and download the pinned Google Pose Landmarker Lite float16 revision 1 once
(~5.8 MB), validating its SHA-256. Generated `public/pose` is ignored and recreated
by these scripts. Runtime/model provenance is in `public/pose/NOTICE.txt`; there is
no runtime CDN dependency. Initial setup needs an internet connection.
Model guide: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker

Migration `011_camera_sets.sql` adds owner-scoped retry metadata only. It was applied
to the configured Neon database with a verified backup and unchanged-record checks.
Automated geometry/lifecycle/API tests and a real browser model-startup check pass;
physical webcam counting accuracy still requires manual testing on your laptop.
