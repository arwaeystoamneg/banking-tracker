# CLAUDE.md — cardsim

Read `HANDOFF.md` first. It has the full context, status, invariants and the prioritized roadmap. `SPEC.md` has the rules, paytables and exact values.

## Commands
- Unit tests: `PYTHONPATH=. python3 tests/test_core.py`
- Validation gates (must pass before and after any engine change): `python3 validate.py --rounds-scale 0.1` (full: no flag, ~15 min)
- Run a config: `python3 -m cardsim.run configs/<name>.json [--rounds 1e7] [--seed N]`
- Regenerate the summary: `python3 make_results.py`
- Regenerate exact baccarat references: `cd oracle && python3 bac_exact.py bac_exact_out.json`, then merge into `reference_values.json`

## Rules
- Every number needs two independent derivations (exact oracle or published anchor, plus MC). Never quote an edge without the run that produced it.
- Game rules belong in configs, never as room-specific code branches.
- Kernel results are per 1 unit bet. Money appears only in `core.settle()` and reports.
- In `prange` loops, each chunk writes only its own accumulator row.
- `reference_values.json` is script-generated; don't hand-edit it.
- BJ room configs are UNCONFIRMED. Flag assumptions in the config `name`/`source`; don't silently "fix" them.
- Report results from both seats: player house edge, and bank (player-dealer) μ/σ after fees and bank cap.
