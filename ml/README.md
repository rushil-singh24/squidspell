# ml/ — Data Collection, Training, Evaluation

## Collecting data (you, not an agent — needs a real webcam)

Activate the repo's shared venv first: `cd ~/squidspell && source .venv/bin/activate && cd ml`

**Static letters (24 total: A-I, K-Y).** Run once per letter, repeating until you hit at
least 150 confident samples for that letter (each run adds `--num-frames` more, default 200,
so one run per letter is usually enough):

```bash
python collect_static.py --letter A
python collect_static.py --letter B
# ...repeat for all 24 letters (A-I, K-Y — J and Z are motion letters, see below)
```

Hold the pose steadily once recording starts — frames where MediaPipe can't confidently see
your hand (confidence < 0.7) or doesn't detect a hand at all are automatically skipped and
don't count toward the total. Press ESC in the video window to stop a run early.

**Motion letters (J, Z) and negative examples.** Run repeatedly per class until you have at
least 40 takes each (aim for 40-60, per the spec) — each run captures exactly one take:

```bash
python collect_motion.py --letter J   # repeat ~40-60 times, performing the J motion each time
python collect_motion.py --letter Z   # repeat ~40-60 times, performing the Z motion each time
python collect_motion.py --letter negative   # repeat ~40-60 times: reposition, sign other
                                              # letters, idle drift — anything that ISN'T J or Z
```

Each take is a ~1.3-second recording window (after a 3-second countdown). If fewer than 2
confident frames are captured in that window, the take is discarded automatically (printed
to the console) and doesn't get saved — just run the command again.

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
