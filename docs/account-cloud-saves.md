# Optional accounts and player-owned cloud storage

Implemented on `codex/account-cloud-saves`. Real Google/MSA consent and API
isolation still require testing with registered OAuth clients and test accounts.
Provider documentation was checked September 28, 2026.

## Player behavior

Anonymous play, browser saves and local level folders remain available. Signing
in creates a separate browser save space for that provider and account. It does
not upload anonymous progress. **Import anonymous progress** makes that transfer
explicit and preserves an account recovery copy first.

Sign-in and cloud consent are separate. Google accounts connect Google Drive;
personal Microsoft accounts connect OneDrive. This release does not link a
Google identity to a Microsoft identity or join accounts by matching email.
Tokens and the active login live in memory, so a reload requires signing in
again. Account saves remain on the device and are found by the stable provider
account ID when that account signs in again.

Enable storage from the account panel. Progress syncs on returning to the arcade
and every minute while the arcade menu is visible. It does not download progress
into a running game or sync after the tab closes. Players should wait for the
synced status before closing. Expiry, offline mode, denied consent, provider
errors and quota failures leave local progress available. Reconnect is an
explicit button so browser popup activation and Google's renewal rules work.

Hard Vacuum's expedition, backup and unreadable recovery slot are included, as
are jumping-game personal bests and the account level library. Other games do
not currently persist progress. New persistent data types must be explicitly
added to the save-slot allowlist and validation; arbitrary browser storage and
credentials are never uploaded.

Signed-in players can switch between **Account levels** and their existing
**Local folder** in the jumping-game menu. The account library works in the
normal builder, including ordering, renaming, deletion and recovery. Local disk
folders are not uploaded implicitly. Import JSON level files from the account
panel to copy them into the account library. Export all game data produces a
portable JSON backup, including levels, which Import backup can restore.

## Provider permissions and authentication

- Google uses Google Identity Services' supported browser token flow. Sign-in
  requests `openid profile email`; storage adds only
  `https://www.googleapis.com/auth/drive.appdata`. Tokens are checked for the
  required grant, and the provider user-info endpoint confirms the account again
  after storage consent. No refresh token or client secret is stored. Access
  renewal requires a user gesture. Hidden app data is not browsable or shareable
  as normal Drive files; export through Arcade.
- Microsoft uses MSAL Browser 5 with authorization code + PKCE, a dedicated
  redirect bridge, the `consumers` authority and an in-memory cache. Login
  requests identity scopes, and storage requests delegated
  `Files.ReadWrite.AppFolder`. The app verifies the personal-account tenant and
  account ID. MSAL manages its protocol state, nonce and token renewal; failures
  requiring interaction lead to Reconnect. No application permissions are used.

OneDrive's `/me/drive/special/approot` creates the provider-enforced app folder,
usually `Apps/<registered application name>`. Users can add files to that folder,
which gives the app access to them. Microsoft's current delegated permission
reference still labels AppFolder **preview**, despite documenting MSA support.
Test the actual consent and Graph operations before release.

Google's alternative `drive.file` scope would permit visible app-created files,
but is a per-file grant rather than a strict folder boundary. It is deliberately
not requested by this implementation. No full-Drive scopes are requested.

Sources: [Google app data](https://developers.google.com/workspace/drive/api/guides/appdata),
[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
[Google token flow](https://developers.google.com/identity/oauth2/web/guides/use-token-model),
[MSAL Browser](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/about-msal-browser),
[redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge),
[OneDrive app folders](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder),
[permission reference](https://learn.microsoft.com/en-us/graph/permissions-reference#filesreadwriteappfolder).

## Setup

1. Choose the canonical HTTPS production origin. Use separate development clients
   and do not allow arbitrary preview domains on production clients.
2. In Google Cloud, enable the Drive API, configure the external OAuth consent
   screen, and create a **Web application** OAuth client. Register the exact
   Authorized JavaScript origins, including scheme and port for development.
   Configure only the identity scopes and `drive.appdata`. Use `/privacy.html`
   for the site's factual data notice after reviewing it for your deployment.
   Add test users while the consent screen is in testing, and complete Google's
   applicable branding/verification requirements before general release.
3. In Microsoft Entra, register an app supporting **personal Microsoft accounts**.
   Add a **Single-page application** redirect URI exactly matching
   `https://YOUR-ORIGIN/auth-redirect.html` (including any configured Vite base
   path). Add delegated `Files.ReadWrite.AppFolder`; remove unneeded default
   Graph permissions such as `User.Read`. Do not create a client secret or enable
   the legacy implicit grant. Name the registration Arcade if you want that
   OneDrive app-folder name.
4. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID` and
   `VITE_MICROSOFT_CLIENT_ID`. For local development, register the exact local
   origin, such as `http://localhost:5173`, and Microsoft's matching
   `/auth-redirect.html` SPA callback. These are public client IDs, never secrets.
5. For the existing Azure deployment, set repository Actions **variables** with
   those two names. The build injects them only on main push builds. PR preview
   builds intentionally have sign-in disabled. Environment values are baked
   into the Vite build; changing a variable requires rebuilding.
6. Deploy the generated `auth-redirect.html`, `privacy.html`, and hosting config
   alongside the rest of `dist`. Do not redirect the auth bridge through React.
   Do not add a Cross-Origin-Opener-Policy header to the bridge: MSAL documents
   that it breaks its response channel. Verify the final host's response headers.

## Save versions and conflicts

`src/accounts/cloudStore.ts` writes immutable JSON workspace snapshots. A UUID
identifies each version; metadata records its parents and a SHA-256 digest.
Google creates the data and metadata together. OneDrive publishes the metadata
only after upload completes; interrupted unpublished uploads are not considered
valid history. Retrying may leave an unused file, but cannot replace a good save.

The sync engine compares the local baseline with the cloud graph. A clean local
copy can advance to a single remote head; local edits can advance the known
remote head. Divergence, multiple heads, or externally removed history requires
an explicit choice. Restoring remote progress first uploads unsynced local edits
as a recovery version. Existing versions remain intact. This avoids relying on
provider-specific overwrite behavior or timestamps to decide which work to lose.
SHA-256 detects mismatched content; it is not an authenticity signature or an
anti-cheat mechanism. Cloud files remain untrusted.

Account workspaces are bounded to 4 MB, including level history, with the existing
1 MB per-level and 500-file validation limits. Browser quota may be lower when
other accounts, anonymous saves and recovery copies consume storage. Local disk
folders keep their existing larger limits. A protective recovery write must
succeed before a restore; storage failures cannot silently discard the old data.

Cloud history is retained, counts against drive quota and is not automatically
pruned. Listings stop safely above 2,000 files (or 20 pages). Export first, then
disconnect and clear the app's cloud data through the provider to start a new
history. On reconnect, choose Use this device to recreate a deleted history.
The panel displays the latest 30 versions. Data in user-controlled files supports
personal high scores, not a verified competitive leaderboard.

## Security and privacy boundaries

The static site has no account database, token service or save upload endpoint.
Browser requests go directly to the identity/storage providers. Display names
stay in memory; account IDs namespace browser caches. Hosting request logs may
still contain IP addresses and requested paths. Review hosting retention before
making broader privacy promises.

The production configurations add a restrictive script policy, fixed provider
connection origins, frame protection, `nosniff`, referrer policy and disabled
camera/microphone/location access. The local production preview uses the same
global headers. OAuth tokens are not logged, placed in application URLs, or
persisted in browser storage. Microsoft's SDK may keep transient protocol
bookkeeping; its token cache is configured for memory only.

Downloaded data passes byte limits before parsing and schema validation before
use. Game-specific migration/validation still runs when an expedition loads;
unreadable or newer saves remain recoverable raw bytes. Level text is never
executed. Provider file IDs are encoded, and pagination cannot redirect bearer
tokens to another origin. OneDrive's preauthenticated download URL is accepted
only on supported HTTPS OneDrive hosts and fetched without Authorization or
cookies. Tokens never come from save-file metadata.

Account changes cancel cloud operations. Local save sessions capture their owner
rather than looking up a mutable current account on each write. Web Locks
serialize same-account sync across tabs where supported; revision graphs and
local compare-before-restore checks protect against conflicting devices/tabs.
Sign-out clears credentials, but keeps saves; disconnect does not revoke grants.
The account panel links to provider permission controls. The privacy page
explains clearing browser data and provider cloud data separately.

These measures limit damage; they do not make a compromised origin safe.
Malicious scripts, browser extensions or a compromised deployment could use
active tokens against authorized game data or attempt phishing. Memory-only
storage and PKCE do not prevent that. Keep dependencies, deployment access and
OAuth registrations protected. In-browser encryption with a key available to the
same scripts would not fix this threat.

## Verification

Unit tests cover namespace isolation, session ownership, concurrent cloud heads,
explicit recovery, cancellation, concurrent local edits, malformed/oversized
content, invalid destinations, bearer-token confinement and level-library
conflicts. Browser tests exercise anonymous operation, separate Google consent,
wrong-account rejection, import/sync/sign-out and account editing using mocked
provider endpoints. The production headers are exercised by browser preview.
Mocks do not prove real consent or provider scope enforcement.

Local verification: build, lint, dependency audit (zero advisories), all 1,336
unit tests and all seven account browser tests pass. The broader affected browser
run passed 106 of 107 checks. The wall-text alignment editor test times out at
its existing dropdown interaction; the same failure reproduces without CSP and
on an unchanged snapshot of the starting `main` commit, `c776bd45`. That existing
editor failure is not resolved by this account change.

Before enabling broadly, use dedicated Google/MSA test accounts to verify:

- Actual consent, cancellation, partial consent, expiry, revocation and reconnect
  in Chrome/Edge, Firefox and Safari, including popup and privacy restrictions.
- Create/list/upload/download under only the documented app-storage scopes, and
  demonstrated denial when requesting an unrelated drive file.
- Two-device conflict/recovery, quota exhaustion and externally removed data.
- App-folder naming, OneDrive download-host compatibility and the deployed CSP.
- Consent-screen publication, privacy notice, domain ownership and final callback
  origins. No live registrations or provider accounts were created by this change.
