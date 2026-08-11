# ml/ — Data Collection, Training, Evaluation

## Collecting data (you, not an agent — needs a real webcam)

Activate the repo's shared venv first: `cd ~/squidspell && source .venv/bin/activate && cd ml`

**Before you start:** have a real ASL fingerspelling reference (chart/video) open — get the
handshapes right yourself, since the model will learn exactly whatever you show it. Use the
**same hand** for every letter and take, the whole way through (handedness isn't recorded, so
mixing hands puts mirrored poses in the same class). The first time you run one of these
scripts, macOS will prompt for camera permission for your terminal app — allow it.

**Static letters (24 total: A-I, K-Y).** Run once per letter, repeating until you hit at
least 150 confident samples for that letter (each run adds `--num-frames` more, default 200,
so one run per letter is usually enough):

```bash
python collect_static.py --letter A
python collect_static.py --letter B
# ...repeat for all 24 letters (A-I, K-Y — J and Z are motion letters, see below)
```

A window opens showing a live preview during the 3-second countdown (get into position before
recording starts), then records until it's collected 200 confidently-detected frames and saves
automatically — no keypress needed to end it. Frames where MediaPipe can't confidently see your
hand (confidence < 0.7) or doesn't detect a hand at all are skipped and don't count toward the
total; if it seems to hang, reposition your hand / check lighting. Press ESC to stop a run early.
If you realize partway through that you signed it wrong, ESC out and just re-run the command —
extra good samples on top of a partial bad run are harmless, no cleanup needed.

**Motion letters (J, Z) and negative examples.** Each run captures exactly **one take**
(~1.3s recording after a 3s countdown), and you need ~40-60 takes per class — typing the
command 150 times would be miserable, so loop it:

```bash
for i in $(seq 1 50); do python collect_motion.py --letter J; done
for i in $(seq 1 50); do python collect_motion.py --letter Z; done
for i in $(seq 1 50); do python collect_motion.py --letter negative; done  # deliberately NOT J/Z:
                                                                            # reposition, other
                                                                            # letters, idle drift
```

Each loop iteration gives you a fresh 3s countdown as a natural pause between reps. If fewer
than 2 frames with a detected hand are captured in a take's window, it's discarded
automatically (printed to the console) and doesn't get saved — that iteration just doesn't
count, no cleanup needed.

**Fixing a bad motion take:** each take is its own file (`data/motion_sequences/J_003.csv`)
plus a row in `manifest.csv`. To discard one, delete **both** the file and its matching
`manifest.csv` row (matched by the `filepath` column) — `validate_data.py` will flag a
manifest row whose file is missing, so don't delete just the file and leave the row behind.

## Checking your progress

At any point, check whether you've met the acceptance criteria:

```bash
python validate_data.py
```

This prints a per-letter (static) and per-class (motion) report and exits non-zero if
anything is still short. Keep collecting for whichever letters/classes show `FAIL`.

## Output locations

- `data/static_landmarks.csv` — one row per confident static-letter frame.
- `data/motion_sequences/<LABEL>_<NNN>.csv` — one file per motion take (20 resampled frames).
- `data/motion_sequences/manifest.csv` — index of every motion take (label, source, filepath,
  raw frame count, capture timestamp) — this is what Phase 2's training script will load.

All of the above are gitignored (see root `.gitignore`) — they're regenerable from these
scripts and aren't meant to be committed.

## Data schema

Everything Phase 2 needs to know about the file formats, in one place:

- **`data/static_landmarks.csv`** — 64 columns: `label`, then `x0,y0,z0,x1,y1,z1,...,x20,y20,z20`
  (21 hand landmarks x 3 coordinates each). One row per confidently-detected static-letter
  frame. See `landmark_row_header()` in `collection_utils.py`.
- **`data/motion_sequences/<LABEL>_<NNN>.csv`** — one file per motion take, 63 columns
  (`x0,y0,z0,...,x20,y20,z20`, same order as above but **no `label` column** — the label
  lives in the manifest, not the per-take file) x N rows, where N is the fixed
  `--resample-len` (default 20) every take is resampled to.
- **`data/motion_sequences/manifest.csv`** — 5 columns: `label, source, filepath,
  num_raw_frames, captured_at`. One row per take: `label` (J/Z/negative), `source` (see
  `DECISIONS.md`), `filepath` (relative to the manifest's own directory, e.g. `J_003.csv`),
  `num_raw_frames` (the actual raw captured-frame count before resampling — not the fixed
  resampled length), and `captured_at` (Unix timestamp).
