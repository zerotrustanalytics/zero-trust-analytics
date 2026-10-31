/**
 * Tally illustrations for empty states, loading and errors (the only places
 * Tally appears inside the app, per the ZTA × Tally handoff). Decorative:
 * the surrounding heading carries the meaning.
 */
type Pose = 'sleep' | 'wave' | 'count' | 'lost' | 'loading'

export function TallyArt({ pose = 'sleep', size = 140, className }: { pose?: Pose; size?: number; className?: string }) {
  return (
    <img
      src={`/tally/tally-${pose}.svg`}
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round(size * (248 / 264))}
      className={className}
    />
  )
}
