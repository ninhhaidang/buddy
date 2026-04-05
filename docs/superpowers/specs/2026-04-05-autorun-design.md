# Auto-run Mode — cc-buddy Enhancement Spec

**Date:** 2026-04-05
**Status:** Approved
**Version:** 1.0

---

## 1. Overview

Thêm `--stat`, `--min-points`, `--parallel`, và `--apply` flags cho `cc-buddy search` để hỗ trợ:
- Filter pet theo tổng điểm stats và stat cụ thể
- Parallel search trên multi-core CPU
- Auto-apply khi tìm thấy match

**Backward compatible:** Không có flags mới → behavior hiện tại.

---

## 2. CLI Interface

```bash
cc-buddy search -s dragon -r legendary --min-points 400 --stat CHAOS 90 --parallel
cc-buddy search -s dragon -r legendary --stat CHAOS 95 --shiny --parallel --apply
cc-buddy search -r rare --stat WISDOM 95 --stat SNARK 90 --min-points 350 --parallel
```

### New Flags

| Flag | Type | Description |
|------|------|-------------|
| `--min-points <N>` | int 0–500 | Total 5 stats >= N |
| `--stat <NAME> <N>` | string + int | Stat NAME >= N. Repeatable. Valid names: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK |
| `--parallel` | flag | Use all CPU cores |
| `--apply` | flag | Auto-apply first match without confirm prompt |

---

## 3. Stats Matching Logic

```javascript
function matchStats(buddy, criteria) {
  // criteria = { statReqs: { CHAOS: 90, WISDOM: 85 }, minPoints: 400 }

  // Check individual stat requirements
  for (const [name, min] of Object.entries(criteria.statReqs)) {
    if ((buddy.stats[name] ?? -1) < min) return false
  }

  // Check total points
  if (criteria.minPoints != null) {
    const total = Object.values(buddy.stats).reduce((a, b) => a + b, 0)
    if (total < criteria.minPoints) return false
  }

  return true
}
```

Stat name case-insensitive. Invalid stat names → reject early with clear error.

---

## 4. Parallel Search Architecture

### Approach: child_process.fork()

- Works on Node.js and Bun (fork `process.execPath`)
- Zero native dependencies
- Auto-detect core count via `os.cpus().length`

### Worker Strategy

```
main process
  ├── detect N = os.cpus().length
  ├── spawn N workers via fork()
  │     each: independent search loop
  │     on match: process.send({ uid, buddy, attempts, workerId })
  └── main:
        ├── receives results via process.on('message')
        ├── selects best by rarity rank (if rarity=auto)
        ├── applies --min-points / --stat filters
        ├── on first qualifying match: kill all workers, apply
        └── logs: "[Worker N] Found: ... @ attempts"
```

### Worker Message Protocol

**To worker:**
```json
{ "type": "START", "criteria": {...}, "limit": 5000000, "salt": "...", "workerId": 0 }
```

**From worker:**
```json
{ "type": "FOUND", "uid": "...", "buddy": {...}, "attempts": 12345, "workerId": 0 }
```

**To worker (stop):**
```json
{ "type": "STOP" }
```

### Fallback

If `--parallel` but spawn fails → fallback single-threaded, warn:
```
  ⚠ Parallel failed (quota/permissions), running single-threaded.
```

If only 1 core detected → silent single-threaded, no warning.

---

## 5. Output Format

### Normal (single-threaded, existing)
```
  🎯 Searching: ✨ legendary 🐉 dragon | points ≥ 400 | CHAOS ≥ 90
  → Found: ★★★★★ legendary dragon ✨ @ 2,341,000
  ...
  ✓ STOPPED after 5.2M attempts (8.1s) — best found

  ════════════════════════════════════
  ✓ BEST RESULT
  ════════════════════════════════════
  🐉 DRAGON
  ★★★★★ legendary ✨ SHINY!
  Eyes: ◉  |  Hat: 😇 halo
  DEBUGGING  ██████████░░░░░░░░░░  67
  PATIENCE   ██████████████░░░░░░  81
  CHAOS      ██████████████████░  94  ← ✓
  WISDOM     █████████████░░░░░░  75
  SNARK      ██████████████░░░░░  78
  Total: 395 / 500  ✓ min-points: 400

  Apply this buddy? [Y/n]: _
```

### Parallel mode header
```
  🎯 Searching: ✨ legendary 🐉 dragon | points ≥ 400 | CHAOS ≥ 90
  ⚡ 12 workers active (12 cores)

  [Worker 1] → Found: ★★★★★ legendary dragon ✨ @ 2,341,000
  [Worker 4] → Found: ★★★★★ legendary dragon @ 891,000
  [Worker 7] → Found: ★★★★★ legendary dragon ✨ @ 3,102,000
```

---

## 6. Code Structure (single file: buddy-reroll.mjs)

### Additions

1. **`buildCriteriaFromArgs(args)`** — parse `--stat` and `--min-points` from CLI args
2. **`matchStats(buddy, statReqs, minPoints)`** — stats filtering logic
3. **`parallelSearch(cr, limit, saltOverride)`** — worker spawn + IPC management
4. **`runWorker(msg)`** — worker loop body (inlined as string eval in fork)

### Modifications

- `match()` in `search()` → add stats check after existing filters
- `parseArgs()` → recognize `--stat`, `--min-points`, `--parallel`, `--apply`
- `cliSearch()` → call `parallelSearch()` when `--parallel` present
- `--apply` in interactiveSearch → bypass yn() confirm prompt

### No New Files

All changes contained in `buddy-reroll.mjs`.

---

## 7. Validation Rules

| Input | Behavior |
|-------|----------|
| `--stat INVALID 90` | Error: "Unknown stat: INVALID. Valid: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK" |
| `--stat CHAOS abc` | Error: "Value must be integer 0–100" |
| `--min-points 600` | Error: "min-points must be 0–500" |
| `--stat CHAOS 150` | Error: "Value must be 0–100" |
| `--parallel` + 1 core | Silent single-threaded |

---

## 8. Backward Compatibility

- No new flags → existing `search`, `check`, `gallery`, etc. unchanged
- Existing CLI flags: `-s`, `-r`, `-e`, `--hat`, `--shiny`, `-l`, `--json` unchanged
- Interactive mode unchanged
- `parseArgs()` ignores unknown flags silently for existing behavior
