# Dream Large Arcade accounts and player-owned cloud storage

Implemented on `codex/account-cloud-saves`. Real Google/MSA consent and API
isolation still require testing with registered OAuth clients and test accounts.
Provider documentation was checked October 2, 2026.

## Player behavior

Players can play without signing in. Guest progress stays on the device. Signing
in selects a separate profile; connecting Google Drive or OneDrive optionally
syncs game progress across devices. Disconnecting or signing out keeps existing
saves. Backups and recovery remain available under **Manage saves**.

L.A.B. ships one built-in collection. Level authoring belongs to the localhost
development studio and writes to the checkout. The game and account panel have
no local level-folder picker, account library, custom-level imports, Google
level picker, or per-file cloud status. Developer drafts never join player cloud
saves. Existing legacy level data in account backups remains compatible and is
preserved by the storage layer; removing the UI does not delete saved files.

Cloud sync continues across navigation. Frequent gameplay saves are grouped into
one automatic upload per 30 seconds and still save locally immediately. **Sync
now** and safe menus can sync sooner. Incoming saves apply at a safe menu or
through **Load cloud saves**, which restarts the game. Expiry, offline mode,
denied consent and provider failures leave local progress available. Reconnect
is explicit. Wait for the account indicator to confirm sync before closing a tab.

Hard Vacuum expedition/recovery, L.A.B. best times and L.A.B. completion are
allowlisted save slots. Other games do not currently persist progress. Arbitrary
browser storage and credentials are never uploaded. Historical level-library
storage and version metadata remain supported solely for backup compatibility.

## Provider permissions and authentication

- Google uses Google Identity Services' supported browser token flow. Sign-in
  requests `openid profile email`; storage adds only
  `https://www.googleapis.com/auth/drive.file`. Tokens are checked for the
  required grant, and the provider user-info endpoint confirms the account again
  after storage consent and before reusing cached access after a reload. Only a
  short-lived access token is cached in tab session storage, bound to the client
  ID, account ID and expiry. No refresh token or client secret is stored. Access
  renewal requires a user gesture. Sign-out and Disconnect clear cached access.
- Microsoft uses MSAL Browser 5 with authorization code + PKCE, a dedicated
  redirect bridge, the `consumers` authority and a localStorage cache. Login
  requests identity scopes, and storage requests delegated
  `Files.ReadWrite.AppFolder`. The app verifies the personal-account tenant and
  account ID. MSAL manages its protocol state, nonce and token renewal; failures
  requiring interaction lead to Reconnect. Restoration uses the exact remembered
  personal account, never the first arbitrary cached account. If credentials are
  unavailable, only the local profile is restored; a verified same-account
  reconnection is required before accessing OneDrive.
  Disconnect stops cloud access without clearing sign-in; sign-out clears the
  selected account's SDK cache and the persistent account selection. No application permissions are used.

OneDrive's `/me/drive/special/approot` creates the provider-enforced app folder,
`Apps/Dream Large Arcade` for this app registration. Users can add files to that folder,
which gives the app access to them. Microsoft's current delegated permission
reference still labels AppFolder **preview**, despite documenting MSA support.
Test the actual consent and Graph operations before release.

Google's `drive.file` scope permits visible app-created or user-selected files;
it is a per-file grant, not a recursive folder grant. Arcade creates
`My Drive/Dream Large Arcade` and records a private app property on that folder
to find it again, including after a rename. Files copied into it outside Arcade
are not automatically accessible. The current game does not import custom
levels from Drive or expose a file picker. No full-Drive scopes are requested.

Sources: [Google file metadata](https://developers.google.com/workspace/drive/api/reference/rest/v2/files),
[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
[Google token flow](https://developers.google.com/identity/oauth2/web/guides/use-token-model),
[MSAL Browser](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/about-msal-browser),
[redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge),
[OneDrive app folders](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder),
[permission reference](https://learn.microsoft.com/en-us/graph/permissions-reference#filesreadwriteappfolder).

## Setup

1. The canonical HTTPS production origin is `https://arcade.dreamlarge.com`.
   Use **Dream Large Arcade** as the OAuth app name, matching the visible homepage
   name and document title. Use separate development clients and do not allow
   arbitrary preview domains on production clients.
2. In Google Cloud, enable the Drive API, configure the external OAuth consent
   screen, and create a **Web application** OAuth client. Register the exact
   Authorized JavaScript origins, including scheme and port for development.
   Configure only the identity scopes and `drive.file`. Use the canonical origin
   plus `/privacy.html` for the privacy-policy URL and `/terms.html` for the
   terms-of-service URL after reviewing both pages for your deployment. Both
   pages are public static HTML, linked from the arcade without signing in.
   Set the authorized domain to `dreamlarge.com`. Verify ownership of that parent
   domain in Google Search Console using an account that is an Owner or Editor
   of the OAuth project. A Search Console Domain property verified with its DNS
   TXT record covers the arcade subdomain. Keep the verification record in DNS;
   connecting a custom domain in Azure alone does not verify it with Google.
   If Google's rejection asks you to wait 24 hours after verification, allow
   that time before retrying. See [Google's branding and domain requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).
   Add test users while the consent screen is in testing, and complete Google's
   applicable branding/verification requirements before general release.
3. In Microsoft Entra, register an app supporting **personal Microsoft accounts**.
   Add a **Single-page application** redirect URI exactly matching
   `https://YOUR-ORIGIN/auth-redirect.html` (including any configured Vite base
   path). Add delegated `Files.ReadWrite.AppFolder`; remove unneeded default
   Graph permissions such as `User.Read`. Do not create a client secret or enable
   the legacy implicit grant. Name the registration **Dream Large Arcade** for that
   OneDrive app-folder name.
4. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID` and
   `VITE_MICROSOFT_CLIENT_ID`. For local development, register the exact local
   origin, such as `http://localhost:5173`, and Microsoft's matching
   `/auth-redirect.html` SPA callback. These are public client IDs, never secrets.
5. For the existing Azure deployment, set repository Actions **variables** with
   the configured client ID names. The build injects
   them only on main push builds. PR preview
   builds intentionally have sign-in disabled. Environment values are baked
   into the Vite build; changing a variable requires rebuilding.
6. Deploy the generated `auth-redirect.html`, `privacy.html`, `terms.html`, their
   stylesheet and logo, and hosting config
   alongside the rest of `dist`. Do not redirect the auth bridge through React.
   Do not add a Cross-Origin-Opener-Policy header to the bridge: MSAL documents
   that it breaks its response channel. Verify the final host's response headers.
   Open both legal URLs on the production origin and check that they show the
   policy headings, not the game selector. A successful HTTP status alone is not
   enough to verify a policy page on a host with a navigation fallback. Missing
   HTML files are excluded from that fallback so incomplete deployments fail
   visibly instead of presenting the game as a policy.

## Save versions and conflicts

Both providers store current data as ordinary files under each game's folder.
OneDrive's root is `Apps/Dream Large Arcade`; Google's is `My Drive/Dream Large Arcade`:

```text
Apps/Dream Large Arcade/
  Hard Vacuum/
    expedition.json
    expedition.backup.json
    expedition.unreadable.json
    History/
  Untitled Jumping Game/
    personal-bests.json
    completed-levels.json
    Levels/
      index.json
      My level.jump-level.json
      Deleted levels/<timestamp-uuid>/<original filename>
    History/
  Sync history/
    Versions/<uuid>.json
    Older versions/<uuid>.json
```

Files and folders are created as needed. Only games with persistent data get
files. The `Levels` directory is the same collection format as local folders and
`public/levels/jumping`: original filenames, level JSON bytes and `index.json`
metadata/order are retained. A missing manifest is generated in filename order.
Copy the level files and manifest together to move a collection; omit the
`Deleted levels` subfolder when publishing built-ins. Levels copied into OneDrive,
and edits, renames or removals made there, are picked up at the next safe-menu
sync. Missing indexed files retain their manifest entries just like local folders.
Invalid files stop sync with local data intact. OneDrive filenames must also meet
OneDrive's filename rules and cannot differ only by capitalization.

The shared `src/accounts/portableStore.ts` archives each game's files under its own
`History/<uuid>` directory before publishing current files. Unchanged files reuse
the previous version's immutable recovery file; frequent progress saves do not
upload more copies of unchanged levels. Each version records the source revision
and hash for each file. `Sync history` holds only revision metadata and file
hashes, not bundled game data. OneDrive can
HTML-escape item descriptions; the adapter decodes these metadata fields once
before validation, without transforming any game or level file contents. File
downloads request full item metadata: `$select` can omit the preauthenticated
download URL annotation. The item ID and eTag are checked before downloading.
Version records
are published only after all recovery files exist. Their parents and SHA-256
digests retain the existing conflict/recovery model. Original current files are
moved into the same game's `History/Replaced` using conditional metadata updates
(`If-Match`); replacement files are created with conflict behavior `fail`. There
are no unchecked overwrite uploads. This also preserves files changed externally
during a sync.

Google's adapter uses Drive v2's JSON `etag` field for conditional metadata
updates, so correctness does not depend on browsers exposing an HTTP ETag header.
Current-file replacement moves the old file with `If-Match` and creates a new
file; it never blindly overwrites contents. Since Drive permits duplicate names,
every listing rejects ambiguity rather than choosing an arbitrary file. Downloads
use Google's API origin, bounded reads and version checks. Folder-ID caches last
only for a snapshot and are refreshed before final verification. A real-account
check must still verify conditional updates and the provider's CORS behavior.

Folder listings use Graph's [path-based children endpoint](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0),
avoiding a separate lookup before every listing. Immutable recovery files upload
with bounded concurrency, and the version record is only written once all files
have succeeded. Publication rechecks the previously read file IDs/eTags and then
verifies the final folder against the IDs/eTags returned by successful writes;
it does not download those same uploaded bytes again. Conditional writes and the
publication marker continue to protect against concurrent changes.

A conditional marker on the `Sync history` folder serializes publication. Other
devices wait while it is active. Failures mark the pending upload as interrupted;
after an abandoned tab, its marker expires after two minutes without renewal.
The next sync retains the partial folder contents and the complete intended
version as competing recovery choices, rather than silently downloading an
incomplete upload. If the files were all written, it finishes the marker instead.
If an interrupted rename leaves duplicate level IDs, the app offers an explicit
local or complete-cloud-version recovery choice. It never imports that invalid
collection, and conditionally retains the interrupted raw files before replacing
them, including any external edits made since the interruption.
Successful unchanged syncs do not rewrite files or create new versions.

There is no migration or reader for the original root-level OneDrive or hidden
Google `arcade-v1-*.json` snapshots. The new layout starts from current account data on
the device or an existing portable game folder. Old files are not automatically
removed. Reconnect Google Drive to grant `drive.file`; old hidden app data is
outside the new permission and remains untouched.

The sync engine compares the local baseline with the cloud graph. A clean local
copy can advance to a single remote head; local edits can advance the known
remote head. Divergence, multiple heads, or externally removed history requires
an explicit choice. Restoring remote progress first uploads unsynced local edits
as a recovery version. Existing versions remain intact. Timestamps never decide
which progress to discard.
SHA-256 detects mismatched content; it is not an authenticity signature or an
anti-cheat mechanism. Cloud files remain untrusted.

Account workspaces are bounded to 4 MB, including level history, with the existing
1 MB per-level and 500-file validation limits. Browser quota may be lower when
other accounts, anonymous saves and recovery copies consume storage. Local disk
folders keep their existing larger limits. A protective recovery write must
succeed before a restore; storage failures cannot silently discard the old data.

Cloud history is retained and counts against drive quota. Both providers keep about
100 version records in the active list, moving older metadata into **Older
versions** once there are more than 120. All unresolved heads and active
transactions remain available, with contiguous ancestry; timestamps do not
decide which branches survive. Parents move before children so an interrupted
archive cannot invent a conflict. Recovery payloads are never deleted or moved
by this housekeeping, and archived versions remain readable by reference.
Existing active histories of up to 20,000 records can be compacted, removing the
previous 2,000-version lifetime limit. Other folder listings remain bounded to
2,000 files, with bounded pagination.
The panel displays the latest 30 active versions. Data in user-controlled files supports
personal high scores, not a verified competitive leaderboard.

## Security and privacy boundaries

The static site has no account database, token service or save upload endpoint.
Browser requests go directly to the identity/storage providers. The selected
provider, account ID, display name and cloud-connection choice are held in
localStorage until sign-out or clearing site data; account IDs namespace browser
caches. This record restores local saves and does not grant provider access.
Hosting request logs may
still contain IP addresses and requested paths. Review hosting retention before
making broader privacy promises.

The production configurations add a restrictive script policy, fixed provider
connection origins, frame protection, `nosniff`, referrer policy and disabled
camera/microphone/location access. The local production preview uses the same
global headers. OAuth tokens are not logged or placed in application URLs.
Google access tokens use memory and tab session storage until their expiry, sign-out
or disconnect. The app does not persist them in localStorage or IndexedDB.
Microsoft's SDK manages authentication artifacts,
including tokens and account details, in its localStorage cache. MSAL encrypts
these artifacts with a key in a session cookie unless the player selects
**Keep me signed in**; encrypted credentials cannot be reused after that browser
session ends. The app separately remembers the selected identity and cloud
choice without copying tokens into its account record. This
follows the SDK's [cache guidance](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching).

Downloaded data passes byte limits before parsing and schema validation before
use. Game-specific migration/validation still runs when an expedition loads;
unreadable or newer saves remain recoverable raw bytes. Level text is never
executed. Provider file IDs are encoded, and pagination cannot redirect bearer
tokens to another origin. OneDrive's preauthenticated download URL is accepted
only on supported HTTPS OneDrive hosts (`*.1drv.com`, `*.storage.live.com`, and
`my.microsoftpersonalcontent.com`) and fetched without Authorization or cookies.
The same hosts are allowed by the production browser policy. The personal-content
host is also returned by [personal OneDrive download responses](https://learn.microsoft.com/en-us/answers/questions/1694139/how-to-fix-the-401-fileopenuserunauthorized-error).
Unknown-host errors show only the hostname, never a private file path or signed
query string. Tokens never come from save-file metadata.

Account changes cancel cloud operations. Local save sessions capture their owner
rather than looking up a mutable current account on each write. Web Locks
serialize same-account sync across tabs. A separate, short workspace lock protects
every level-library mutation and workspace replacement, including import and
restore. The authoritative library is read and committed in an IndexedDB
transaction; localStorage remains a cache for synchronous status reads. Web Locks
alone are insufficient because different tabs can observe stale localStorage
caches even after taking the same lock. Library reads, sync snapshots and exports
refresh from the committed database. A save only resolves after its transaction
commits; failed commits roll back cache changes and keep the previous database
copy. Existing local library bytes seed the database on its first transaction.
Browsers without Web Locks reject these operations with an explanation. Revision graphs and local compare-before-
restore checks protect against conflicting devices/tabs.
Sign-out clears credentials, but keeps saves; disconnect does not revoke grants.
The account panel links to provider permission controls. The privacy page
explains clearing browser data and provider cloud data separately.

These measures limit damage; they do not make a compromised origin safe.
Malicious scripts, browser extensions or a compromised deployment could use
active tokens against authorized game data or attempt phishing. Browser caching
and PKCE do not prevent that. Keep dependencies, deployment access and
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

Folder-layout coverage exercises portable collection round trips, byte-preserved
level/manifest imports, external changes, recycle/restore, competing writers,
conditional moves, interrupted publication, stale leases, tampered archives and
bearer-token confinement. The account browser flow exercises the OneDrive layout
through mocked Graph and Google Drive boundaries, concurrent same-profile tabs, edits made during
uploads, and autosave batching with explicit sync. History tests cover file reuse,
more than 2,000 versions, clock skew and interrupted archiving. Real provider behavior still requires a signed-in
provider check; mocked responses do not establish live API guarantees. Google
browser coverage includes reloads, expiry, wrong cached accounts, disconnect,
sign-out, visible progress storage links and upload feedback.
Both providers also exercise fresh tabs or browser sessions with only persistent
storage retained, profile restoration before gameplay, legacy session upgrades,
and sign-out surviving a later visit. Google tests cover persistent-storage
failure; Microsoft tests use the real SDK cache and discard its session-cookie
encryption key to exercise credential expiry separately from profile persistence.

On the Windows development host, the production build and account-file lint pass.
The broader unit run encounters two existing symlink tests that require Windows
symlink privileges. Repository-wide lint also includes existing lighting scratch
files and jumping-game React-hook violations. These are separate from the
account-folder checks.

Before enabling broadly, use dedicated Google/MSA test accounts to verify:

- Actual consent, cancellation, partial consent, expiry, revocation and reconnect
  in Chrome/Edge, Firefox and Safari, including popup and privacy restrictions.
- Create/list/upload/download under only the documented app-storage scopes, and
  demonstrated denial when requesting an unrelated drive file.
- Two-device conflict/recovery, quota exhaustion and externally removed data.
- App-folder naming, OneDrive download-host compatibility and the deployed CSP.
- Consent-screen publication, privacy notice, domain ownership and final callback
  origins. No live registrations or provider accounts were created by this change.
