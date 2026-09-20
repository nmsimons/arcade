/** A recording is shown only while deliberately connected to its source. */
export function TetherInfo({ record, onOpen }: {
  record: { title: string; speaker: string; text: string }; onOpen: () => void
}) {
  return <button onClick={onOpen} aria-label={`Read recording: ${record.title}`} aria-keyshortcuts="G" className="tether-info absolute bottom-48 lg:bottom-24 left-4 max-w-[min(32rem,calc(100%-2rem))] text-left border-l border-[#93b7a9]/50 bg-[#050d0d]/90 px-3 py-3 text-xs text-[#c2d1c8]">
    <span className="block text-[9px] tracking-widest text-[#83afa1] mb-2">{record.speaker}</span>
    <span className="leading-relaxed">{record.text}</span>
  </button>
}
