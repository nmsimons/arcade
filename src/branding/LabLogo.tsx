import { LAB_LOGO_HEIGHT, LAB_LOGO_WIDTH, LAB_NAME, LAB_SUBTITLE_PATH, LAB_WORDMARK_PATH } from './lab'
import './lab.css'

export function LabLogo({ className = '', decorative = false }: { className?: string; decorative?: boolean }) {
  return <svg className={`lab-logo ${className}`} viewBox={`0 0 ${LAB_LOGO_WIDTH} ${LAB_LOGO_HEIGHT}`}
    width={LAB_LOGO_WIDTH} height={LAB_LOGO_HEIGHT} role={decorative ? undefined : 'img'}
    aria-label={decorative ? undefined : LAB_NAME} aria-hidden={decorative || undefined}>
    <path className="lab-wordmark" d={LAB_WORDMARK_PATH} fill="currentColor" fillRule="evenodd" />
    <path className="lab-subtitle" d={LAB_SUBTITLE_PATH} fill="var(--lab-subtitle-ink, currentColor)" fillRule="evenodd" />
  </svg>
}
