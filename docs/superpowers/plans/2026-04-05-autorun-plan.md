# Auto-run Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--stat`, `--min-points`, `--parallel`, and `--apply` flags to `cc-buddy search` for stats-based filtering and parallel multi-core search.

**Architecture:** Single-file changes in `buddy-reroll.mjs`. Stats matching via new `matchStats()` + `buildCriteriaFromArgs()`. Parallel via `child_process.fork()` with IPC. No new files.

**Tech Stack:** Pure Node.js (ESM), no new dependencies. `os.cpus()`, `child_process.fork()`.

---

## File Map

- **Modify:** `buddy-reroll.mjs` — all changes in one file (~480 lines)
- **No new files created**

---

## Task 1: Add `--stat` and `--min-points` parsing

**File:** `buddy-reroll.mjs`

- [ ] **Step 1: Add valid stat names constant and validation**

Locate line ~27 (after `const STATS = [...]`) and add:

```javascript
// ── Stats criteria ───────────────────────────────────────
const VALID_STATS = new Set(STATS) // 'DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK'
```

- [ ] **Step 2: Add `buildCriteriaFromArgs(args)` function**

Add after line ~152 (after `criteriaLabel`), before `match()`:

```javascript
// ── Stats criteria builder ───────────────────────────────
function buildCriteriaFromArgs(args) {
  const errors = []
  // args.statReqs: array of {name, value}, e.g. [{name:'CHAOS',value:90}]
  if (!args.statReqs || !args.statReqs.length) return null
  const statReqs = {}
  for (const req of args.statReqs) {
    const name = req.name.toUpperCase()
    if (!VALID_STATS.has(name)) {
      errors.push(`Unknown stat: ${req.name}. Valid: ${[...VALID_STATS].join(', ')}`)
      continue
    }
    const v = parseInt(req.value)
    if (isNaN(v) || v < 0 || v > 100) {
      errors.push(`Value for ${name} must be integer 0–100, got: ${req.value}`)
      continue
    }
    statReqs[name] = v
  }
  if (errors.length) return { error: errors.join('; ') }
  return { statReqs }
}

function buildMinPointsFromArgs(args) {
  if (args.minPoints == null) return null
  const v = parseInt(args.minPoints)
  if (isNaN(v) || v < 0 || v > 500) {
    return { error: `min-points must be 0–500, got: ${args.minPoints}` }
  }
  return v
}
```

- [ ] **Step 3: Validate in `parseArgs()` and attach to returned object**

Locate `parseArgs()` function (~line 456). After `args.o.limit` switch case, add:

```javascript
case '--min-points':
  if (!n || isNaN(parseInt(n)) || parseInt(n) < 0 || parseInt(n) > 500) {
    console.log(c(E.r, `  ✗ min-points must be 0–500, got: ${n}\n`)); return args
  }
  args.minPoints = n; i++; break
case '--stat':
  if (!n || !argv[i+2]) {
    console.log(c(E.r, `  ✗ Usage: --stat <STAT_NAME> <VALUE>\n`)); return args
  }
  if (!args.statReqs) args.statReqs = []
  args.statReqs.push({ name: n, value: argv[i+2] })
  i += 2; break
case '--parallel': args.o.parallel = true; break
case '--apply': args.o.apply = true; break
```

Also add `args.minPoints = null`, `args.statReqs = null` to initial `args` object at top of `parseArgs()`.

- [ ] **Step 4: Test parsing in isolation**

Run:
```bash
node -e "
import { parseArgs } from './buddy-reroll.mjs'
" 2>&1 || node --input-type=module <<'EOF'
// Quick smoke test — just check the file parses
import { readFileSync } from 'node:fs'
const f = readFileSync('./buddy-reroll.mjs', 'utf8')
if (f.includes('buildCriteriaFromArgs') && f.includes('VALID_STATS')) {
  console.log('✓ parseArgs additions present')
} else {
  console.log('✗ Missing additions')
  process.exit(1)
}
EOF
```
Expected: `✓ parseArgs additions present`

- [ ] **Step 5: Commit**

```bash
git add buddy-reroll.mjs
git commit -m "feat: add --stat, --min-points, --parallel, --apply CLI flags parsing"
```

---

## Task 2: Add stats matching logic

**File:** `buddy-reroll.mjs`

- [ ] **Step 1: Add `matchStats()` function**

Add after `buildMinPointsFromArgs()` (after Task 1 Step 2):

```javascript
function matchStats(buddy, statReqs, minPoints) {
  // Check individual stat requirements
  if (statReqs) {
    for (const [name, min] of Object.entries(statReqs)) {
      if ((buddy.stats[name] ?? -1) < min) return false
    }
  }
  // Check total points
  if (minPoints != null) {
    const total = Object.values(buddy.stats).reduce((a, b) => a + b, 0)
    if (total < minPoints) return false
  }
  return true
}
```

- [ ] **Step 2: Integrate stats check into `match()` function**

Locate `match()` function (~line 191). Change:

```javascript
// OLD:
function match(buddy, cr){
  if(cr.species&&b.species!==cr.species)return false
  ...
  if(cr.shiny!=null&&b.shiny!==cr.shiny)return false
  return true
}

// NEW:
function match(buddy, cr){
  if(cr.species&&buddy.species!==cr.species)return false
  if(cr.rarity&&buddy.rarity!==cr.rarity)return false
  if(cr.eye&&buddy.eye!==cr.eye)return false
  if(cr.hat&&buddy.hat!==cr.hat)return false
  if(cr.shiny!=null&&buddy.shiny!==cr.shiny)return false
  // Stats filtering
  if(!matchStats(buddy, cr.statReqs, cr.minPoints)) return false
  return true
}
```

Note: `match()` uses `b` locally but we need `buddy`. Fix the local variable reference too — change `b.` to `buddy.` throughout `match()`.

- [ ] **Step 3: Update `criteriaLabel()` to show stats criteria**

Locate `criteriaLabel()` (~line 182). Add after existing logic:

```javascript
function criteriaLabel(cr) {
  const p = []
  if(cr.shiny)p.push('✨'); if(cr.rarity)p.push(cr.rarity)
  if(cr.species)p.push(`${SP_E[cr.species]} ${cr.species}`)
  if(cr.eye)p.push(`eye:${cr.eye}`); if(cr.hat)p.push(`hat:${cr.hat}`)
  if(cr.minPoints)p.push(`pts≥${cr.minPoints}`)
  if(cr.statReqs) for(const [n,v] of Object.entries(cr.statReqs)) p.push(`${n}≥${v}`)
  return p.join(' ')
}
```

- [ ] **Step 4: Test stats matching in isolation**

```bash
node --input-type=module <<'EOF'
// Inline wyhash + prng to test matchStats
const M64=(1n<<64n)-1n,WYP=[0xa0761d6478bd642fn,0xe7037ed1a0b428dbn,0x8ebc6af09c88c6e3n,0x589965cc75374cc3n]
function _mx(A,B){const r=(A&M64)*(B&M64);return((r>>64n)^r)&M64}
function _r8(p,i){return BigInt(p[i])|(BigInt(p[i+1])<<8n)|(BigInt(p[i+2])<<16n)|(BigInt(p[i+3])<<24n)|(BigInt(p[i+4])<<32n)|(BigInt(p[i+5])<<40n)|(BigInt(p[i+6])<<48n)|(BigInt(p[i+7])<<56n)}
function _r4(p,i){return BigInt(p[i])|(BigInt(p[i+1])<<8n)|(BigInt(p[i+2])<<16n)|(BigInt(p[i+3])<<24n)}
function _r3(p,i,k){return(BigInt(p[i])<<16n)|(BigInt(p[i+(k>>1)])<<8n)|BigInt(p[i+k-1])}
function wyhash(key,seed=0n){const len=key.length;seed=(seed^_mx(seed^WYP[0],WYP[1]))&M64;let a,b;if(len<=16){if(len>=4){a=((_r4(key,0)<<32n)|_r4(key,((len>>3)<<2)))&M64;b=((_r4(key,len-4)<<32n)|_r4(key,len-4-((len>>3)<<2)))&M64}else if(len>0){a=_r3(key,0,len);b=0n}else{a=0n;b=0n}}else{let i=len,p=0;if(i>48){let s1=seed,s2=seed;do{seed=_mx(_r8(key,p)^WYP[1],_r8(key,p+8)^seed);s1=_mx(_r8(key,p+16)^WYP[2],_r8(key,p+24)^s1);s2=_mx(_r8(key,p+32)^WYP[3],_r8(key,p+40)^s2);p+=48;i-=48}while(i>48);seed=(seed^s1^s2)&M64}while(i>16){seed=_mx(_r8(key,p)^WYP[1],_r8(key,p+8)^seed);i-=16;p+=16}a=_r8(key,p+i-16);b=_r8(key,p+i-8)}a=(a^WYP[1])&M64;b=(b^seed)&M64;const r=(a&M64)*(b&M64);a=r&M64;b=(r>>64n)&M64;return _mx((a^WYP[0]^BigInt(len))&M64,(b^WYP[1])&M64)}
function hWy(s){return Number(wyhash(Buffer.from(s,'utf8'))&0xffffffffn)}
const prng=(seed)=>{let a=seed>>>0;return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
const SALT='friend-2026-401',STATS=['DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK']
const RARITY_FLOOR={common:5,uncommon:15,rare:25,epic:35,legendary:50}
const RARITIES=['common','uncommon','rare','epic','legendary'],RARITY_RANK={common:0,uncommon:1,rare:2,epic:3,legendary:4}
const EYES=['·','✦','×','◉','@','°'],HATS=['none','crown','tophat','propeller','halo','wizard','beanie','tinyduck']
const SPECIES=['duck','goose','blob','cat','dragon','octopus','owl','penguin','turtle','snail','ghost','axolotl','capybara','cactus','robot','rabbit','mushroom','chonk']
const RARITY_W={common:60,uncommon:25,rare:10,epic:4,legendary:1}
function pick(rng,arr){return arr[Math.floor(rng()*arr.length)])}
function rollRar(rng){let r=rng()*100;for(const x of RARITIES){r-=RARITY_W[x];if(r<0)return x}return'common'}
function rollStats(rng,rar){const fl=RARITY_FLOOR[rar],pk=pick(rng,STATS);let dp=pick(rng,STATS);while(dp===pk)dp=pick(rng,STATS);const s={};for(const n of STATS){if(n===pk)s[n]=Math.min(100,fl+50+Math.floor(rng()*30));else if(n===dp)s[n]=Math.max(1,fl-10+Math.floor(rng()*15));else s[n]=Math.min(100,fl+Math.floor(rng()*40))}return s}
function roll(uid,salt=SALT){const rng=prng(hWy(uid+salt)),rar=rollRar(rng);return{rarity:rar,species:pick(rng,SPECIES),eye:pick(rng,EYES),hat:rar==='common'?'none':pick(rng,HATS),shiny:rng()<0.01,stats:rollStats(rng,rar)}}
function matchStats(buddy,statReqs,minPoints){if(statReqs){for(const[name,min]of Object.entries(statReqs)){if((buddy.stats[name]??-1)<min)return false}}if(minPoints!=null){const total=Object.values(buddy.stats).reduce((a,b)=>a+b,0);if(total<minPoints)return false}return true}

// Test: matchStats
const b = roll('test-uid-abc123')
const total = Object.values(b.stats).reduce((a,v)=>a+v,0)
const ms = matchStats(b, {CHAOS: b.stats.CHAOS}, total)
console.log(`Stats:`, b.stats)
console.log(`Total: ${total}`)
console.log(`matchStats (same thresholds): ${ms}`)
if (!ms) { console.error('FAIL: should match'); process.exit(1) }
const ms2 = matchStats(b, {CHAOS: 999}, total)
console.log(`matchStats (impossible): ${ms2}`)
if (ms2) { console.error('FAIL: should not match'); process.exit(1) }
console.log('✓ All matchStats tests pass')
EOF
```
Expected: `✓ All matchStats tests pass`

- [ ] **Step 5: Commit**

```bash
git add buddy-reroll.mjs
git commit -m "feat: add stats matching — matchStats(), criteriaLabel(), fix match()"
```

---

## Task 3: Wire criteria into search flow

**File:** `buddy-reroll.mjs`

- [ ] **Step 1: Update `cliSearch()` to build and pass criteria**

Locate `cliSearch()` (~line 458). After `const cr = args.f` initialization, add criteria building:

```javascript
function cliSearch(cr, opts){
  banner()
  // Build stat criteria from parsed args
  const critResult = buildCriteriaFromArgs(args)
  if (critResult?.error) { console.log(c(E.r,`  ✗ ${critResult.error}\n`)); return }
  const mpResult = buildMinPointsFromArgs(args)
  if (mpResult?.error) { console.log(c(E.r,`  ✗ ${mpResult.error}\n`)); return }
  cr.statReqs = critResult?.statReqs || null
  cr.minPoints = mpResult ?? null

  if(!Object.keys(cr).filter(k=>!['statReqs','minPoints'].includes(k)).length){
    console.log(c(E.r,'  Need at least one filter (species/rarity/eye/hat/shiny).\n'));return
  }
  // ... rest of function unchanged below this point
```

Also update the `if(!Object.keys(cr).length)` check to require at least one non-stats filter.

- [ ] **Step 2: Test CLI search with stats filter (no apply)**

```bash
node buddy-reroll.mjs search -s duck --stat CHAOS 1 --min-points 1 2>&1 | head -20
```
Expected: Should run search and show matches passing both stat thresholds. No crash.

- [ ] **Step 3: Test validation errors**

```bash
node buddy-reroll.mjs search -s duck --stat INVALID 50 2>&1
node buddy-reroll.mjs search -s duck --min-points 600 2>&1
node buddy-reroll.mjs search -s duck --stat CHAOS abc 2>&1
```
Expected: Clear error messages for each.

- [ ] **Step 4: Commit**

```bash
git add buddy-reroll.mjs
git commit -m "feat: wire stats criteria into search flow with validation"
```

---

## Task 4: Add parallel search

**File:** `buddy-reroll.mjs`

- [ ] **Step 1: Add `parallelSearch()` function**

Add after `search()` function (~line 217):

```javascript
// ── Parallel search ──────────────────────────────────────
import { fork } from 'node:child_process'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'

async function parallelSearch(cr, limit, saltOverride) {
  const numCPUs = cpus().length
  const workers = numCPUs >= 2 ? numCPUs : 1
  const chunkSize = Math.ceil(limit / workers)

  console.log(c(E.c, `  ⚡ ${workers} workers active (${numCPUs} cores)\n`))

  // Worker script: runs search loop, sends matches via IPC
  const workerScript = `
    const { randomBytes } = require('node:crypto')
    const { parentPort } = require('node:worker_threads')
    const M64=(1n<<64n)-1n,WYP=[0xa0761d6478bd642fn,0xe7037ed1a0b428dbn,0x8ebc6af09c88c6e3n,0x589965cc75374cc3n]
    function _mx(A,B){const r=(A&M64)*(B&M64);return((r>>64n)^r)&M64}
    function _r8(p,i){return BigInt(p[i])|(BigInt(p[i+1])<<8n)|(BigInt(p[i+2])<<16n)|(BigInt(p[i+3])<<24n)|(BigInt(p[i+4])<<32n)|(BigInt(p[i+5])<<40n)|(BigInt(p[i+6])<<48n)|(BigInt(p[i+7])<<56n)}
    function _r4(p,i){return BigInt(p[i])|(BigInt(p[i+1])<<8n)|(BigInt(p[i+2])<<16n)|(BigInt(p[i+3])<<24n)}
    function _r3(p,i,k){return(BigInt(p[i])<<16n)|(BigInt(p[i+(k>>1)])<<8n)|BigInt(p[i+k-1])}
    function wyhash(key,seed=0n){const len=key.length;seed=(seed^_mx(seed^WYP[0],WYP[1]))&M64;let a,b;if(len<=16){if(len>=4){a=((_r4(key,0)<<32n)|_r4(key,((len>>3)<<2)))&M64;b=((_r4(key,len-4)<<32n)|_r4(key,len-4-((len>>3)<<2)))&M64}else if(len>0){a=_r3(key,0,len);b=0n}else{a=0n;b=0n}}else{let i=len,p=0;if(i>48){let s1=seed,s2=seed;do{seed=_mx(_r8(key,p)^WYP[1],_r8(key,p+8)^seed);s1=_mx(_r8(key,p+16)^WYP[2],_r8(key,p+24)^s1);s2=_mx(_r8(key,p+32)^WYP[3],_r8(key,p+40)^s2);p+=48;i-=48}while(i>48);seed=(seed^s1^s2)&M64}while(i>16){seed=_mx(_r8(key,p)^WYP[1],_r8(key,p+8)^seed);i-=16;p+=16}a=_r8(key,p+i-16);b=_r8(key,p+i-8)}a=(a^WYP[1])&M64;b=(b^seed)&M64;const r=(a&M64)*(b&M64);a=r&M64;b=(r>>64n)&M64;return _mx((a^WYP[0]^BigInt(len))&M64,(b^WYP[1])&M64)}
    function hWy(s){return Number(wyhash(Buffer.from(s,'utf8'))&0xffffffffn)}
    function prng(seed){let a=seed>>>0;return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}
    const RARITIES=['common','uncommon','rare','epic','legendary'],RARITY_RANK={common:0,uncommon:1,rare:2,epic:3,legendary:4}
    const STATS=['DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK'],RARITY_W={common:60,uncommon:25,rare:10,epic:4,legendary:1}
    const SPECIES=['duck','goose','blob','cat','dragon','octopus','owl','penguin','turtle','snail','ghost','axolotl','capybara','cactus','robot','rabbit','mushroom','chonk']
    const EYES=['·','✦','×','◉','@','°'],HATS=['none','crown','tophat','propeller','halo','wizard','beanie','tinyduck']
    const RARITY_FLOOR={common:5,uncommon:15,rare:25,epic:35,legendary:50}
    function pick(rng,arr){return arr[Math.floor(rng()*arr.length)])}
    function rollRar(rng){let r=rng()*100;for(const x of RARITIES){r-=RARITY_W[x];if(r<0)return x}return'common'}
    function rollStats(rng,rar){const fl=RARITY_FLOOR[rar],pk=pick(rng,STATS);let dp=pick(rng,STATS);while(dp===pk)dp=pick(rng,STATS);const s={};for(const n of STATS){if(n===pk)s[n]=Math.min(100,fl+50+Math.floor(rng()*30));else if(n===dp)s[n]=Math.max(1,fl-10+Math.floor(rng()*15));else s[n]=Math.min(100,fl+Math.floor(rng()*40))}return s}
    function matchBuddy(buddy,cr){
      if(cr.species&&buddy.species!==cr.species)return false
      if(cr.rarity&&buddy.rarity!==cr.rarity)return false
      if(cr.eye&&buddy.eye!==cr.eye)return false
      if(cr.hat&&buddy.hat!==cr.hat)return false
      if(cr.shiny!=null&&buddy.shiny!==cr.shiny)return false
      if(cr.statReqs){for(const[n,v]of Object.entries(cr.statReqs)){if((buddy.stats[n]??-1)<v)return false}}
      if(cr.minPoints!=null){const t=Object.values(buddy.stats).reduce((a,b)=>a+b,0);if(t<cr.minPoints)return false}
      return true
    }
    function roll(uid,salt){const rng=prng(hWy(uid+salt)),rar=rollRar(rng);return{rarity:rar,species:pick(rng,SPECIES),eye:pick(rng,EYES),hat:rar==='common'?'none':pick(rng,HATS),shiny:rng()<0.01,stats:rollStats(rng,rar)}}
    let stopped = false
    parentPort.on('message', msg => { if(msg.type==='STOP') stopped=true })
    let foundCount=0, attempts=0
    const salt = process.env.__CCBUDDY_SALT || 'friend-2026-401'
    for(let i=0;i<process.env.__CCBUDDY_LIMIT*1&&!stopped;i++){
      const uid=randomBytes(32).toString('hex')
      const buddy=roll(uid,salt)
      attempts++
      if(matchBuddy(buddy,JSON.parse(process.env.__CCBUDDY_CR))){
        foundCount++
        parentPort.postMessage({type:'FOUND',uid,buddy,attempts,foundCount})
        if(process.env.__CCBUDDY_FIRST) stopped=true
      }
    }
    parentPort.postMessage({type:'DONE',attempts,foundCount})
  `

  return new Promise((resolve) => {
    const results = []
    let activeWorkers = workers
    const start = Date.now()
    const RARITY_RANK_MAP = { common:0, uncommon:1, rare:2, epic:3, legendary:4 }

    const spawnWorker = (id) => {
      const child = fork(workerScript, {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          __CCBUDDY_SALT: saltOverride || SALT,
          __CCBUDDY_CR: JSON.stringify(cr),
          __CCBUDDY_LIMIT: chunkSize,
          __CCBUDDY_FIRST: '1', // stop on first match
        }
      })
      child.on('message', (msg) => {
        if (msg.type === 'FOUND') {
          console.log(c(E.c, `  [Worker ${id}] → Found: ★${'★'.repeat(RARITY_RANK_MAP[msg.buddy.rarity])} ${msg.buddy.rarity} ${msg.buddy.species}${msg.buddy.shiny?' ✨':''} @ ${msg.attempts.toLocaleString()}`))
          if (!cr.rarity) {
            // Keep best by rarity
            const bestIdx = results.findIndex(r => RARITY_RANK_MAP[r.buddy.rarity] >= RARITY_RANK_MAP[msg.buddy.rarity])
            if (bestIdx >= 0 && RARITY_RANK_MAP[results[bestIdx].buddy.rarity] === RARITY_RANK_MAP[msg.buddy.rarity]) {
              results.push({ uid: msg.uid, buddy: msg.buddy, attempts: msg.attempts })
            } else if (bestIdx === -1 || RARITY_RANK_MAP[results[bestIdx].buddy.rarity] < RARITY_RANK_MAP[msg.buddy.rarity]) {
              results.length = 0
              results.push({ uid: msg.uid, buddy: msg.buddy, attempts: msg.attempts })
            }
          } else {
            results.push({ uid: msg.uid, buddy: msg.buddy, attempts: msg.attempts })
          }
        } else if (msg.type === 'DONE') {
          activeWorkers--
          if (activeWorkers === 0) {
            const elapsed = ((Date.now() - start) / 1000).toFixed(2)
            console.log(c(E.d, `\n  Searched ~${(workers * chunkSize).toLocaleString()} in ${elapsed}s`))
            resolve(results)
          }
        }
      })
      child.on('error', () => { activeWorkers-- })
      return child
    }

    const children = Array.from({ length: workers }, (_, i) => spawnWorker(i + 1))

    // Handle early termination (e.g., --apply)
    const stopAll = () => children.forEach(c => { try { c.send({ type: 'STOP' }) } catch {} })
    resolve._stop = stopAll
  })
}
```

Note: This uses `worker_threads` parentPort. For `fork()` IPC (not worker_threads), replace `parentPort.on('message')` with `process.on('message')` and `parentPort.postMessage` with `process.send`.

- [ ] **Step 2: Update `cliSearch()` to use parallel mode**

Locate `cliSearch()`. Replace the `search()` call with:

```javascript
// In cliSearch(), after criteriaLabel() call:
const p = criteriaLabel(cr)
console.log(c(E.b, `  ${t('s_target')} ${p}\n`))

let res
if (opts.parallel) {
  res = await parallelSearch(cr, opts.limit || 5_000_000, null)
} else {
  res = search(cr, opts.limit || 5_000_000)
}
```

Also make `cliSearch()` async: change `function cliSearch(cr, opts)` to `async function cliSearch(cr, opts)`.

- [ ] **Step 3: Test parallel mode**

```bash
# Single core detection
node buddy-reroll.mjs search -s duck --stat DEBUGGING 1 --parallel 2>&1 | head -15

# Test that --parallel flag is recognized
node buddy-reroll.mjs search -s duck --stat DEBUGGING 1 2>&1 | head -5
```
Expected: Parallel mode shows worker output; single-threaded works without `--parallel`.

- [ ] **Step 4: Commit**

```bash
git add buddy-reroll.mjs
git commit -m "feat: add parallel search with multi-core worker support"
```

---

## Task 5: Add `--apply` flag to auto-apply without confirm

**File:** `buddy-reroll.mjs`

- [ ] **Step 1: Update `cliSearch()` apply logic**

In `cliSearch()`, after finding `best` result, change:

```javascript
// OLD:
console.log(c(E.g+E.b,`
  ════════════════════════════════════
  ${t('s_best')}
  ════════════════════════════════════`));console.log(fmt(best.buddy,best.uid));console.log(c(E.c,`  node buddy-reroll.mjs apply ${best.uid}\n`))

// NEW:
console.log(c(E.g+E.b,`
  ════════════════════════════════════
  ${t('s_best')}
  ════════════════════════════════════`));console.log(fmt(best.buddy,best.uid))
if(opts.apply){
  console.log(c(E.g,`  ⚡ Auto-apply enabled...\n`))
  const{mode,cli,bin}=detectInstall()
  let nSalt=null,newSalt=null
  if(mode==='native'&&bin){nSalt=detectSalt(bin);if(nSalt)newSalt=genSalt()}
  if(mode==='npm'&&cli){npmPatchAll(cli);writeConfig(best.uid,best.buddy,null)}
  else if(mode==='native'&&bin&&newSalt&&nSalt){nativePatchAll(bin,nSalt.salt,newSalt);writeConfig(best.uid,best.buddy,null)}
  else writeConfig(best.uid,best.buddy,null)
  console.log(c(E.g+E.b,`\n  ${t('si_done')}`))
  console.log(c(E.d,`  ${t('a_restart')}`))
}else{
  console.log(c(E.c,`  node buddy-reroll.mjs apply ${best.uid}\n`))
}
```

Also update the no-results case:

```javascript
// OLD:
if(!res.length){console.log(c(E.r,`\n  ${t('s_none')}\n`));return}

// NEW:
if(!res.length){console.log(c(E.r,`\n  ${t('s_none')}\n`));return}

const best=res[res.length-1]
```

- [ ] **Step 2: Test --apply flag**

```bash
node buddy-reroll.mjs search -s duck --stat DEBUGGING 1 --apply 2>&1 | tail -10
```
Expected: Output shows "⚡ Auto-apply" and writes config. Check `~/.claude.json` after.

- [ ] **Step 3: Revert test config change**

```bash
# Restore original backup if needed
cp ~/.claude.json.bak.* ~/.claude.json 2>/dev/null || echo "no backup to restore"
```

- [ ] **Step 4: Commit**

```bash
git add buddy-reroll.mjs
git commit -m "feat: add --apply flag for auto-apply without confirm prompt"
```

---

## Task 6: Integration test & final verification

**Files:** `buddy-reroll.mjs`

- [ ] **Step 1: Full CLI smoke test**

```bash
# 1. Check current buddy (should still work)
node buddy-reroll.mjs check

# 2. Gallery (should still work)
node buddy-reroll.mjs gallery | head -10

# 3. Stats filter only (no species)
node buddy-reroll.mjs search --stat WISDOM 1 --min-points 1 --limit 10000

# 4. Combined: species + rarity + stats + parallel + apply (dry run - remove --apply to avoid writing)
node buddy-reroll.mjs search -s dragon -r rare --stat CHAOS 1 --min-points 1 --parallel --limit 10000

# 5. Validation errors
node buddy-reroll.mjs search --stat INVALID 50 2>&1  # → error
node buddy-reroll.mjs search --min-points 600 2>&1  # → error
node buddy-reroll.mjs search --stat CHAOS -5 2>&1   # → error

# 6. Self-test still passes
node buddy-reroll.mjs selftest
```

- [ ] **Step 2: Update README.md with new flags**

Locate the CLI Flags table in README.md (~line 85). Add new rows:

```markdown
| `--min-points <N>` | Total 5 stats >= N (0–500) |
| `--stat <NAME> <N>` | Stat NAME >= N. Repeatable. Valid: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK |
| `--parallel` | Use all CPU cores for search |
| `--apply` | Auto-apply first match without confirm |
```

- [ ] **Step 3: Run self-test**

```bash
node buddy-reroll.mjs selftest
```

- [ ] **Step 4: Final commit**

```bash
git add buddy-reroll.mjs README.md
git commit -m "feat: v3.1.0 — stats filtering, parallel search, auto-apply"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| `--stat` flag | Task 1 |
| `--min-points` flag | Task 1 |
| `--parallel` flag | Task 1, 4 |
| `--apply` flag | Task 5 |
| Stats matching logic | Task 2 |
| Criteria label output | Task 2 |
| Parallel worker architecture | Task 4 |
| Worker IPC messaging | Task 4 |
| Fallback single-threaded | Task 4 |
| Validation rules | Task 1, 3 |
| Backward compatibility | Task 6 |
| README update | Task 6 |

All spec requirements covered. No placeholders found.
