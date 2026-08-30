import { SquidMascot } from '../components/SquidMascot'

export function RacePanePlaceholder() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        textAlign: 'center',
      }}
    >
      <SquidMascot mood="idle" />
      <p style={{ margin: 0, color: 'var(--sq-fg-muted)' }}>
        Race mode — coming in Phase 7
      </p>
    </div>
  )
}

export default RacePanePlaceholder
