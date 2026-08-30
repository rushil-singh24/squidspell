import { SquidMascot } from '../components/SquidMascot'

export function TrainPanePlaceholder() {
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
        Train mode — coming in Phase 6
      </p>
    </div>
  )
}

export default TrainPanePlaceholder
