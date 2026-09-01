import { supabase, isSupabaseConfigured } from './supabase'

/**
 * One saved Train-mode transcript. Same shape whether it came from
 * `localStorage` (anonymous) or the Supabase `translations` table (signed in).
 */
export type TrainEntry = { id: string; text: string; savedAt: number }

const HISTORY_KEY = 'squidspell-train-history'

type TranslationRow = { id: string; sentence: string; created_at: string }

/** Anonymous read: the original `TrainPane.loadHistory()` logic, verbatim. */
function loadLocal(): TrainEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is TrainEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as TrainEntry).id === 'string' &&
        typeof (e as TrainEntry).text === 'string' &&
        typeof (e as TrainEntry).savedAt === 'number',
    )
  } catch {
    return []
  }
}

function writeLocal(next: TrainEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

function newEntry(text: string): TrainEntry {
  return {
    id:
      crypto.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text,
    savedAt: Date.now(),
  }
}

/** True when we should use the `localStorage` store instead of Supabase. */
function anon(userId: string | null): boolean {
  return userId === null || !isSupabaseConfigured || !supabase
}

export async function loadTrainHistory(
  userId: string | null,
): Promise<TrainEntry[]> {
  if (anon(userId)) return loadLocal()

  const { data, error } = await supabase!
    .from('translations')
    .select('id,sentence,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[trainHistory] load failed; falling back to local store', error)
    return loadLocal()
  }

  return ((data ?? []) as TranslationRow[]).map((row) => ({
    id: row.id,
    text: row.sentence,
    savedAt: Date.parse(row.created_at),
  }))
}

export async function saveTrainSentence(
  userId: string | null,
  text: string,
): Promise<TrainEntry[]> {
  if (anon(userId)) {
    const next = [newEntry(text), ...loadLocal()]
    writeLocal(next)
    return next
  }

  const { error } = await supabase!
    .from('translations')
    .insert({ user_id: userId, sentence: text })

  if (error) {
    console.warn('[trainHistory] save failed; falling back to local store', error)
    const next = [newEntry(text), ...loadLocal()]
    writeLocal(next)
    return next
  }

  return loadTrainHistory(userId)
}

export async function deleteTrainSentence(
  userId: string | null,
  id: string,
): Promise<TrainEntry[]> {
  if (anon(userId)) {
    const next = loadLocal().filter((e) => e.id !== id)
    writeLocal(next)
    return next
  }

  // RLS (`auth.uid() = user_id`) scopes the delete to the current user.
  const { error } = await supabase!.from('translations').delete().eq('id', id)

  if (error) {
    console.warn(
      '[trainHistory] delete failed; falling back to local store',
      error,
    )
    const next = loadLocal().filter((e) => e.id !== id)
    writeLocal(next)
    return next
  }

  return loadTrainHistory(userId)
}
