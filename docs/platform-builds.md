# Browser and desktop builds

The games share their React, canvas, physics, level assets and save formats. The
browser starts in `src/main.tsx`, including the existing account restoration and
Google/OneDrive UI. The desktop starts in `src/main.desktop.tsx` and connects to
the Electron bridge before mounting a game. `src/platform/contracts.ts` defines
the small platform interface. Game code must not import Electron or Node APIs.

## Local development

Use the Node version in `.nvmrc`. There are two independent dependency lockfiles;
browser-only development does not need to download Electron.

```sh
npm ci
npm ci --prefix desktop
npm run dev:web
```

In another terminal, start the installed desktop experience:

```sh
npm run dev:desktop
```

This builds the desktop renderer and launches Electron against local packaged
assets. Restart the command after changes; desktop hot reload is not implemented
yet. `npm run dev` and `npm run build` remain browser aliases.

| Command | Result |
| --- | --- |
| `npm run build:web` | Browser files in `dist/web/` |
| `npm run preview` | Serves `dist/web/` |
| `npm run build:desktop` | Renderer and release metadata in `desktop/renderer/` |
| `npm run package:desktop` | Builds, then packages the current OS in `desktop/out/` (Windows/Linux x64; Mac arm64) |
| `npm run archive:desktop` | Archives the packaged app for CI/Steam and prepares website downloads |
| `npm run test:desktop` | Tests the built renderer in Electron |
| `npm run security:check --prefix desktop` | Audits desktop build dependencies |

Windows, Linux and Mac packaging runs on their respective operating systems.
Windows and Linux target x64; Mac targets Apple silicon (arm64). Intel Mac builds
are not supported. Linux
tests use `xvfb-run --auto-servernum npm run test:desktop` with Playwright's Linux
runtime dependencies installed. Set `ARCADE_TEST_PACKAGED=1` to run the same tests
against the packaged executable instead of the development Electron binary.
To check an extracted release download, also set `ARCADE_TEST_EXECUTABLE` to its
absolute executable path. The smoke test uses isolated saves and checks all four
game menus, a playable jumping level, fullscreen, and save persistence.

## Desktop assets and saves

Electron serves installed files through `arcade://game/`. Game routes resolve to
the application entry point; missing assets and level JSON return 404. The
packaged application requires no Vite server or hosted website. Its renderer is
sandboxed, has no Node access, and cannot navigate to remote code. Explicit HTTPS
links open in the system browser. Mac builds keep the native application, edit
and window menus for Command-Q, copy/paste and window controls.

Desktop game saves use the existing keys and JSON schemas, written beneath
Electron's `userData` folder in `saves/local/`. The default application name is
`Dream Large Arcade`; normal Windows user data is beneath `%APPDATA%`, Linux
user data is normally beneath `~/.config`, and Mac user data is beneath
`~/Library/Application Support`. Each key is encoded as a filename.
Primary, backup and unreadable recovery slots remain separate files. Writes
stage a temporary file, flush it, then rename it before reporting success. Save
failures retain the existing recovery behavior. Browser save keys and migrations
remain compatible and are covered by the existing tests.

The narrow storage bridge is synchronous to preserve the current acknowledged
save contract, including visible write failures. File operations have size and
slot limits and run only for the application's main frame. An asynchronous
adapter should be introduced alongside an explicit asynchronous game save
contract, rather than reporting success before a file has been written.

`ARCADE_USER_DATA` overrides the data directory for isolated testing. Desktop
settings and remembered browser-style folder handles still use Electron's
browser storage. Local level import/export and folder editing reuse the current
renderer APIs; native folder dialogs and Deck usability need further review.
Do not sync an entire Chromium profile as game progress.

## CI and release artifacts

The Azure workflow continues to build, test and deploy the same retained browser
artifact, now from `dist/web/`. Desktop builds are independent:

1. Shared lint, unit tests, level validation and renderer compilation run once.
2. Windows, Linux and Apple silicon Mac runners download that renderer, install desktop dependencies,
   package it, and test the actual installed files, routes, saves and controls.
3. Each package is retained as a tar archive so executable permissions are
   preserved when artifacts move between jobs or machines.
4. Website downloads are prepared as a Windows ZIP, Linux tar.gz and, when Apple
   signing is configured, a notarized Apple silicon Mac ZIP. Mac ZIPs use
   `ditto` to preserve app-bundle metadata. Signature, notarization ticket and
   Gatekeeper checks must pass before a Mac ZIP is produced.
5. Windows and Linux downloads are extracted and smoke-tested again before
   upload. Signed Mac downloads get the same check when signing is configured.

Desktop builds run on pull requests, main pushes, manual dispatch and tags named
`desktop-vVERSION`. A release tag must match `desktop/package.json`. Each renderer
includes `release.json` with its product, version and source commit. Product
branding and starting route come from `release/products/arcade.json`. This first
product is the whole arcade; packaging individual games also requires selecting
their routes, assets and menu behavior, which is not implemented yet.

## Website downloads

The homepage has one **Downloads** link to `/downloads/`, served by
`downloads/index.html`.
That page has its own browser entry point, `src/main.downloads.tsx`, so visiting
the homepage does not load the download UI or check GitHub releases. The downloads
page checks this public repository's GitHub Releases API, without
credentials, for the newest published stable `desktop-vVERSION` release with
recognized assets. It activates only the exact expected files in that release.
Drafts, prereleases, missing assets and unknown download hosts do not become
download links. Until the first release is published, the options say “Coming
soon.” API failures, including anonymous rate limits, show a link to the public
releases page instead. The desktop app does not run this lookup.

The website keeps serving browser games and does not host the large desktop
archives. Publishing a desktop release makes its downloads available without
redeploying the website. Updates currently mean downloading and extracting a new
archive; an automatic updater and Windows installer are not implemented. Progress
stays in the app's user-data directory, separately from the installation folder.

For a release:

1. Set `desktop/package.json` to a new version and commit the tested changes.
2. Push a matching `desktop-vVERSION` tag. The workflow builds and tests all three
   targets, then creates a **draft** GitHub Release containing download archives,
   `SHA256SUMS.txt` and installation instructions. Re-running a tag can replace
   draft assets, but cannot overwrite an already published release.
3. Download and review the draft files, including a Steam Deck playtest and Mac
   installation on another machine. Publish the draft when ready. The downloads page
   will pick it up on its next visit.

Expected public files:

```text
dream-large-arcade-windows-x64.zip
dream-large-arcade-linux-x64.tar.gz
dream-large-arcade-macos-arm64.zip   # Included only after signing/notarization
SHA256SUMS.txt
```

Windows downloads are currently unsigned portable builds, so Windows may show a
publisher warning. Windows code signing remains a separate release task.

## Mac signing and notarization

Mac CI builds run unsigned on pull requests and main pushes, so development does
not need an Apple account. Public Mac downloads use a Developer ID Application
certificate and Apple notarization, with the following GitHub Actions secrets:

| Secret | Value |
| --- | --- |
| `MAC_CERTIFICATE_BASE64` | Base64-encoded exported Developer ID Application `.p12`, including its private key |
| `MAC_CERTIFICATE_PASSWORD` | Password protecting that `.p12` |
| `MAC_SIGNING_IDENTITY` | Full `Developer ID Application: … (TEAMID)` identity |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer team ID |

Signing secrets are used only on desktop release tags and imported into an
ephemeral Mac keychain. No configured secrets means unsigned CI artifacts and no
public Mac ZIPs; partially configured secrets fail the release with the missing
secret name. Signing or notarization failures must not silently publish an
unsigned download. Only Apple silicon Mac downloads are accepted. Credentials
are never written into the renderer or application bundle.
See [Electron's signing guide](https://www.electronjs.org/docs/latest/tutorial/code-signing).

For local signing on a Mac, set `ARCADE_MAC_SIGNED=1`, `ARCADE_MAC_KEYCHAIN` to an
existing keychain containing the certificate, and the identity/notarization
variables listed above before packaging and archiving. Otherwise local packaging
produces a development `.app`; only CI tar artifacts are created for that Mac.

## Steam upload preparation

Run **Prepare Steam upload** with a successful trusted Desktop builds push run,
your App ID, separate Windows/Linux depot IDs, and an existing beta branch. It
stages the exact tested packages and generates portable SteamPipe VDF files:

```text
content/
  win32-x64/                 # Executable and supporting files
  linux-x64/                 # Executable and supporting files
scripts/
  app_build.vdf
  depot_WINDOWS_ID.vdf
  depot_LINUX_ID.vdf
```

Extract the resulting archive and use the Steamworks SDK's SteamCMD with a build
account authorized for your app:

```sh
steamcmd +login YOUR_BUILD_ACCOUNT +run_app_build scripts/app_build.vdf +quit
```

The generated script selects the named beta branch. Configure each depot's OS
and the executable launch options in Steamworks. Test the installed beta and then
promote that tested build to the default branch. The preparation workflow does
not authenticate to Steam, upload content or promote a release; unattended
uploading needs a separately configured authenticated build environment.

## Remaining Steam and Deck work

- Steam account identity and per-Steam-user save directories. This initial build
  has a local profile per OS user, with no Steamworks API integration.
- Steam Cloud path configuration, including Windows/Linux path mapping. Cloud
  saves and browser/desktop cross-save are not active yet.
- Actual Steam Deck Gaming Mode testing: controller-only startup, audio,
  1280×800 readability, graphics performance, suspend/resume, offline play and
  save behavior. The desktop enables audio without a keyboard or mouse gesture
  and pauses through focus loss on system suspend, but hardware behavior is unverified.
- Controller access to all advertised content and editor flows, Steam Input
  configuration, overlay integration and eventual Valve compatibility review.

See [Electron packaging](https://github.com/electron/packager),
[SteamPipe uploads](https://partner.steamgames.com/doc/sdk/uploading),
[Steam Cloud](https://partner.steamgames.com/doc/features/cloud), and
[Deck compatibility requirements](https://partner.steamgames.com/doc/steamhardware/compat).
