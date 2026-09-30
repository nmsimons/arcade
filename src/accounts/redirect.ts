import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge'
void broadcastResponseToMainFrame().catch(() => {
  const status = document.getElementById('auth-status')
  if (status) status.textContent = 'Sign-in could not finish. Close this window and try again in the arcade.'
})
