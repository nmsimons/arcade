import { useLayoutEffect } from 'react'
import { allowCloudDownloads } from './runtime'
export function useCloudDownloads(allowed: boolean) {
  useLayoutEffect(() => allowCloudDownloads(allowed), [allowed])
}
