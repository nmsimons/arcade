import type { PlatformServices } from './contracts.ts'
import { webPlatform } from './web/index.ts'

let services = webPlatform
export const getPlatform = () => services
export function configurePlatform(next: PlatformServices) { services = next }
