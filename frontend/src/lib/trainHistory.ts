import { supabase, isSupabaseConfigured } from './supabase'

/**
 * One saved Train-mode transcript, read from the Supabase `translations` table.
 * Persistence is account-only — logged out means nothing is saved or shown.
 */
export type TrainEntry = { id: string; text: string; savedAt: number }

type TranslationRow = { id: string; sentence: string; created_at: string }

/** True when there is no signed-in account to persist against. */
function anon(userId: string | null): boolean {
  return userId === null || !isSupabaseConfigured || !supabase
}

export async function loadTrainHistory(
  userId: string | null,
): Promise<TrainEntry[] | null> {
  if (anon(userId)) return []

  const { data, error } = await supabase!
    .from('translations')
    .select('id,sentence,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    // Return null so the caller keeps whatever it already has.
    console.warn('[trainHistory] load failed; keeping current state', error)
    return null
  }

  return ((data ?? []) as TranslationRow[]).map((row) => ({
    id: row.id,
    text: row.sentence,
    savedAt: Date.parse(row.created_at) || Date.now(),
  }))
}

export async function saveTrainSentence(
  userId: string | null,
  text: string,
): Promise<TrainEntry[] | null> {
  // No account → nothing to do; the UI should not have offered Save.
  if (anon(userId)) return null

  const { error } = await supabase!
    .from('translations')
    .insert({ user_id: userId, sentence: text })

  if (error) {
    throw new Error(error.message || error.details || JSON.stringify(error))
  }

  return loadTrainHistory(userId)
}

export async function deleteTrainSentence(
  userId: string | null,
  id: string,
): Promise<TrainEntry[] | null> {
  if (anon(userId)) return null

  // Scope the delete to the signer explicitly, matching the sibling selects —
  // defense in depth on top of RLS (`auth.uid() = user_id`), not RLS-only.
  const { error } = await supabase!
    .from('translations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message || error.details || JSON.stringify(error))
  }

  return loadTrainHistory(userId)
}
