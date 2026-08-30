import { PageTransition } from './motion/PageTransition'
import { AppShell } from './components/AppShell'
import { BubbleField } from './components/BubbleField'

export default function App() {
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <BubbleField />
      <PageTransition>
        <AppShell />
      </PageTransition>
    </div>
  )
}
