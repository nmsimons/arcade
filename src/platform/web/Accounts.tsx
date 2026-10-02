import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { useCloudDownloads } from '../../accounts/useCloudDownloads'

const AccountControls = lazy(() => import('../../accounts/AccountControls'))
export function WebAccounts() {
  const { pathname } = useLocation()
  useCloudDownloads(pathname === '/')
  return <Suspense fallback={null}><AccountControls /></Suspense>
}
