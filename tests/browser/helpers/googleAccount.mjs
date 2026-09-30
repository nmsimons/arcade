import { expect } from './test.mjs'
import { googleDrive } from '../../helpers/googleDrive.mjs'

export async function providers(page, drive = googleDrive()) {
  const scopes = []
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.testAccount = 'alice';
    window.testTokenRequests = 0;
    window.google = { accounts: { oauth2: {
      initTokenClient: options => ({ requestAccessToken() {
        window.testScope = options.scope;
        window.testTokenRequests++;
        if (window.testDeny) { options.callback({ error: 'access_denied' }); return; }
        const complete = () => options.callback({ access_token: window.testAccount + '-token', expires_in: window.testExpiresIn ?? 3600, scope: window.testPartial ? 'openid profile email' : options.scope });
        if (window.testDelay) { window.testComplete = complete; return; }
        complete();
      } }),
      hasGrantedAllScopes: (response, ...scopes) => scopes.every(scope => response.scope.split(' ').includes(scope))
    } } };
  ` }))
  await page.route('https://openidconnect.googleapis.com/v1/userinfo', route => {
    const who = route.request().headers().authorization.includes('bob') ? 'bob' : 'alice'
    return route.fulfill({ json: { sub: who, name: who === 'alice' ? 'Alice Example' : 'Bob Example' } })
  })
  await page.route('https://www.googleapis.com/**', async route => {
    const request = route.request()
    scopes.push(await page.evaluate(() => window.testScope))
    const response = await drive.fetch(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined })
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() })
  })
  return { drive, scopes }
}
export async function picker(page, drive) {
  await page.exposeFunction('grantPickedGoogleFiles', ids => {
    for (const id of ids) if (drive.items.has(id)) drive.items.get(id).appAccessible = true
  })
  await page.route('https://docs.google.com/picker*', route => route.fulfill({ contentType: 'text/html', body: `
    <button onclick="parent.postMessage('picked', '*')">Select files</button>
    <button onclick="parent.postMessage('cancel', '*')">Cancel</button>
  ` }))
  await page.route('https://apis.google.com/js/api.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.gapi = { load(name, options) {
      class DocsView {
        setParent(id) { this.parent = id; return this }
        setIncludeFolders() { return this }
        setSelectFolderEnabled() { return this }
      }
      class PickerBuilder {
        setAppId(id) { this.appId = id; return this }
        setDeveloperKey(key) { this.key = key; return this }
        setOAuthToken(token) { this.token = token; return this }
        setOrigin(origin) { this.origin = origin; return this }
        setTitle() { return this }
        enableFeature(feature) { this.feature = feature; return this }
        addView(view) { this.view = view; return this }
        setCallback(callback) { this.callback = callback; return this }
        build() {
          window.testPickerOptions = this;
          const iframe = document.createElement('iframe');
          iframe.title = 'Google Drive picker'; iframe.src = 'https://docs.google.com/picker';
          iframe.style.cssText = 'position:fixed;inset:10%;width:80%;height:70%;z-index:99999;background:white';
          const receive = async event => {
            (window.testPickerMessages ??= []).push({ origin: event.origin, data: event.data });
            if (event.origin !== 'https://docs.google.com') return;
            const ids = window.testPickedFileIds ?? [];
            if (event.data === 'picked') {
              await window.grantPickedGoogleFiles(ids);
              this.callback({ action: 'picked', docs: ids.map(id => ({ id, url: 'https://evil.example/not-used' })) });
            } else if (event.data === 'cancel') this.callback({ action: 'cancel' });
          };
          window.addEventListener('message', receive);
          return {
            setVisible() { document.body.append(iframe); iframe.addEventListener('load', () => iframe.focus()); },
            dispose() { window.testPickerDisposed = true; iframe.remove(); window.removeEventListener('message', receive); }
          };
        }
      }
      window.google.picker = { DocsView, PickerBuilder, Feature: { MULTISELECT_ENABLED: 'multiselect' } };
      options.callback();
    } };
  ` }))
}

export async function login(page) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Alice Example' })).toBeVisible()
}
