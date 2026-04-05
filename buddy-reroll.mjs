#!/usr/bin/env node
/**
 * 🎰 cc-buddy v3.0.0
 * Interactive pet reroller for Claude Code /buddy.
 * Cross-platform: Node.js 16+ / Bun. Bilingual: EN / Tiếng Việt.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, copyFileSync, realpathSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { execSync, fork } from 'node:child_process'
import { cpus } from 'node:os'

// ── Constants ────────────────────────────────────────────
const VERSION = '3.0.15'
const SALT = 'friend-2026-401'
const CONFIG_PATH = join(homedir(), '.claude.json')
const PREF_PATH = join(homedir(), '.claude-buddy.json')
const MIN_CC_VER = '2.1.89'

const SPECIES = ['duck','goose','blob','cat','dragon','octopus','owl','penguin','turtle','snail','ghost','axolotl','capybara','cactus','robot','rabbit','mushroom','chonk']
const RARITIES = ['common','uncommon','rare','epic','legendary']
const RARITY_W = { common:60, uncommon:25, rare:10, epic:4, legendary:1 }
const RARITY_RANK = { common:0, uncommon:1, rare:2, epic:3, legendary:4 }
const EYES = ['·','✦','×','◉','@','°']
const HATS = ['none','crown','tophat','propeller','halo','wizard','beanie','tinyduck']
const STATS = ['DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK']

// ── Stats criteria ───────────────────────────────────────
const VALID_STATS = new Set(STATS) // 'DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK'

const RARITY_FLOOR = { common:5, uncommon:15, rare:25, epic:35, legendary:50 }

const SP_E = { duck:'🦆',goose:'🪿',blob:'🫧',cat:'🐱',dragon:'🐉',octopus:'🐙',owl:'🦉',penguin:'🐧',turtle:'🐢',snail:'🐌',ghost:'👻',axolotl:'🦎',capybara:'🦫',cactus:'🌵',robot:'🤖',rabbit:'🐰',mushroom:'🍄',chonk:'🐈' }
const HAT_E = { none:'—',crown:'👑',tophat:'🎩',propeller:'🧢',halo:'😇',wizard:'🧙',beanie:'⛑',tinyduck:'🐤' }
const RAR_S = { common:'★',uncommon:'★★',rare:'★★★',epic:'★★★★',legendary:'★★★★★' }

// ── ANSI ─────────────────────────────────────────────────
const NO_CLR = !!process.env.NO_COLOR || process.argv.includes('--no-color')
const TTY = process.stdout.isTTY !== false
const E = { rs:'\x1b[0m',b:'\x1b[1m',d:'\x1b[2m',r:'\x1b[31m',g:'\x1b[32m',y:'\x1b[33m',bl:'\x1b[34m',m:'\x1b[35m',c:'\x1b[36m',w:'\x1b[37m',gr:'\x1b[90m' }
const RC = { common:E.w, uncommon:E.g, rare:E.bl, epic:E.m, legendary:E.y }
const c = (code, text) => (!NO_CLR && TTY) ? `${code}${text}${E.rs}` : text

// ── i18n ─────────────────────────────────────────────────
let L = 'en'
const I = {
  banner:       { en:'🎰 Claude Buddy Reroller',         vi:'🎰 Claude Buddy Reroller' },
  rt_bun:       { en:'Runtime: Bun ✓',                   vi:'Runtime: Bun ✓' },
  rt_node:      { en:'Runtime: Node.js (wyhash)',         vi:'Runtime: Node.js (wyhash)' },
  menu_title:   { en:'What would you like to do?',       vi:'Bạn muốn làm gì?' },
  menu_search:  { en:'🔍  Search & apply buddy',         vi:'🔍  Tìm & áp dụng buddy' },
  menu_check:   { en:'👀  Check current buddy',          vi:'👀  Xem buddy hiện tại' },
  menu_diy:     { en:'✏️   Customize name/personality',   vi:'✏️   Tùy chỉnh tên/tính cách' },
  menu_gallery: { en:'📋  Species gallery',              vi:'📋  Bảng thú cưng' },
  menu_test:    { en:'🧪  Self-test hash',               vi:'🧪  Tự kiểm tra hash' },
  menu_lang:    { en:'🌐  Switch language',              vi:'🌐  Đổi ngôn ngữ' },
  menu_exit:    { en:'👋  Exit',                         vi:'👋  Thoát' },
  si_species:   { en:'Pick a species (Enter to skip):',  vi:'Chọn loài (Enter để bỏ qua):' },
  si_rarity:    { en:'Pick rarity (Enter = auto-best):', vi:'Chọn độ hiếm (Enter = tự tìm tốt nhất):' },
  si_auto:      { en:'Auto (find highest rarity)',       vi:'Tự động (tìm độ hiếm cao nhất)' },
  si_eye:       { en:'Pick eyes (Enter to skip):',       vi:'Chọn mắt (Enter để bỏ qua):' },
  si_hat:       { en:'Pick hat (Enter to skip):',        vi:'Chọn mũ (Enter để bỏ qua):' },
  si_any:       { en:'Any',                              vi:'Bất kỳ' },
  si_shiny:     { en:'Require shiny? [y/N]:',            vi:'Yêu cầu shiny? [y/N]:' },
  si_apply:     { en:'Apply this buddy? [Y/n]:',         vi:'Áp dụng buddy này? [Y/n]:' },
  si_done:      { en:'Done! Restart Claude Code → /buddy.',vi:'Xong! Khởi động lại Claude Code → /buddy.' },
  si_skip:      { en:'Not applied.',                     vi:'Không áp dụng.' },
  si_again:     { en:'Search again? [Y/n]:',             vi:'Tìm lại? [Y/n]:' },
  chk_oauth:    { en:'🔍 Current Buddy (OAuth):',        vi:'🔍 Buddy hiện tại (OAuth):' },
  chk_oauth_w:  { en:'⚠ OAuth active — this is what /buddy shows.',vi:'⚠ OAuth đang đăng nhập — đây là buddy hiện tại.' },
  chk_after:    { en:'🔄 After apply (userID):',         vi:'🔄 Sau khi apply (userID):' },
  chk_cur:      { en:'🔍 Current Buddy (userID):',       vi:'🔍 Buddy hiện tại (userID):' },
  chk_none:     { en:'No config found.',                 vi:'Không tìm thấy cấu hình.' },
  chk_no_id:    { en:'No userID or OAuth found.',        vi:'Không tìm thấy userID hay OAuth.' },
  gal_sp:       { en:'📋 All 18 Species:',               vi:'📋 Tất cả 18 loài:' },
  gal_rar:      { en:'🎲 Rarities:',                     vi:'🎲 Độ hiếm:' },
  gal_eye:      { en:'👀 Eyes:',                          vi:'👀 Mắt:' },
  gal_hat:      { en:'🎩 Hats:',                          vi:'🎩 Mũ:' },
  gal_note:     { en:'Shiny: 1%. Common pets have no hats.',vi:'Shiny: 1%. Thú common không có mũ.' },
  s_target:     { en:'🎯 Searching:',                    vi:'🎯 Đang tìm:' },
  s_found:      { en:'→ Found:',                          vi:'→ Tìm thấy:' },
  s_done:       { en:'Searched {0} in {1}s',              vi:'Đã tìm {0} lần, mất {1}s' },
  s_none:       { en:'✗ No match. Try relaxing criteria.',vi:'✗ Không tìm thấy. Thử nới lỏng điều kiện.' },
  s_best:       { en:'✓ BEST RESULT',                    vi:'✓ KẾT QUẢ TỐT NHẤT' },
  a_bak:        { en:'Backup:',                           vi:'Backup:' },
  a_oauth:      { en:'OAuth → removed accountUuid',       vi:'OAuth → đã xóa accountUuid' },
  a_ok:         { en:'✓ Config updated!',                 vi:'✓ Đã cập nhật cấu hình!' },
  a_restart:    { en:'Restart Claude Code → /buddy',      vi:'Khởi động lại Claude Code → /buddy' },
  v_ok:         { en:'Claude Code {0} ✓',                vi:'Claude Code {0} ✓' },
  v_old:        { en:'✗ Claude Code {0} too old! Need >= {1}. Run: claude update',vi:'✗ Claude Code {0} quá cũ! Cần >= {1}. Chạy: claude update' },
  v_unk:        { en:'⚠ Cannot detect version. Need >= {0}.',vi:'⚠ Không phát hiện được phiên bản. Cần >= {0}.' },
  t_title:      { en:'🧪 Self-Test: Hash',               vi:'🧪 Tự kiểm tra: Hash' },
  t_ok:         { en:'✓ All match! wyhash-js accurate.', vi:'✓ Khớp hoàn toàn! wyhash-js chính xác.' },
  t_fail:       { en:'✗ Mismatch! Use Bun.',             vi:'✗ Không khớp! Dùng Bun.' },
  t_no_bun:     { en:'⚠ Install Bun to verify: curl -fsSL https://bun.sh/install | bash',vi:'⚠ Cài Bun để xác minh: curl -fsSL https://bun.sh/install | bash' },
  lang_saved:   { en:'✓ Language: English',               vi:'✓ Ngôn ngữ: Tiếng Việt' },
  diy_name:     { en:'Give it a name (Enter to skip):',   vi:'Đặt tên cho nó (Enter để bỏ qua):' },
  diy_pers:     { en:'Describe personality (Enter to skip):',vi:'Mô tả tính cách (Enter để bỏ qua):' },
  diy_set:      { en:'✓ Custom soul: {0}',                vi:'✓ Đã đặt soul: {0}' },
  diy_auto:     { en:'Soul auto-generated on first /buddy.',vi:'Soul sẽ được tạo tự động khi dùng /buddy lần đầu.' },
  diy_none:     { en:'No buddy found. Search first!',     vi:'Chưa tìm được buddy. Hãy tìm trước!' },
  diy_cur:      { en:'Current buddy:',                    vi:'Buddy hiện tại:' },
  diy_done:     { en:'✓ Soul updated!',                   vi:'✓ Đã cập nhật soul!' },
  press:        { en:'Press Enter to continue...',         vi:'Nhấn Enter để tiếp tục...' },
  env_warn:     { en:'⚠ Detected ANTHROPIC_BASE_URL (proxy) with {0}.\n  Proxy users don\'t need these! Remove from settings.json.',vi:'⚠ Phát hiện ANTHROPIC_BASE_URL (proxy) cùng với {0}.\n  Người dùng proxy không cần các biến này! Xóa khỏi settings.json.' },
  p_unk_attr:   { en:'⚠ Custom attributes: cli.js format changed, skipped',vi:'⚠ Thuộc tính tùy chỉnh: định dạng cli.js đã thay đổi, bỏ qua' },
  p_unk_buddy:  { en:'⚠ /buddy unlock: cli.js format changed, skipped',vi:'⚠ Mở khóa /buddy: định dạng cli.js đã thay đổi, bỏ qua' },
  p_unk_tele:   { en:'⚠ Speech bubbles: cli.js format changed, skipped',vi:'⚠ Bong bóng chat: định dạng cli.js đã thay đổi, bỏ qua' },
  n_skip:       { en:'⚠ Native binary: SALT not found, patching skipped. Custom buddy may not take effect.',vi:'⚠ Binary gốc: không tìm thấy SALT, bỏ qua patch. Buddy tùy chỉnh có thể không hoạt động.' },
  si_pts:        { en:'Min total points (0–500, Enter to skip):',vi:'Tổng điểm tối thiểu (0–500, Enter để bỏ qua):' },
  si_pts_hint:   { en:'Total of all 5 stats: DEBUGGING+PATIENCE+CHAOS+WISDOM+SNARK (max 500)',vi:'Tổng 5 chỉ số: DEBUGGING+PATIENCE+CHAOS+WISDOM+SNARK (tối đa 500)' },
  si_stat_name:  { en:'Pick a stat to filter (Enter = done):',vi:'Chọn chỉ số để lọc (Enter = xong):' },
  si_stat_val:   { en:'  {0} minimum (0–100, Enter to skip):',vi:'  {0} tối thiểu (0–100, Enter để bỏ qua):' },
  si_stat_done:  { en:'  [Enter] Done adding stats',vi:'  [Enter] Xong thêm chỉ số' },
  si_parallel:   { en:'Use all CPU cores? [y/N]:',vi:'Dùng tất cả CPU? [y/N]:' },
  si_auto_apply: { en:'Auto-apply without confirm? [y/N]:',vi:'Tự áp dụng không hỏi? [y/N]:' },
  si_unlimited:  { en:'Unlimited mode? [y/N]:',vi:'Chế độ không giới hạn? [y/N]:' },
  tip_override:  { en:'💡 Tip: edit ~/.claude.json → "companionOverride" to fine-tune species/rarity/eye/hat/shiny/stats/customFace/customSprite anytime.',vi:'💡 Mẹo: sửa ~/.claude.json → "companionOverride" để chỉnh loài/độ hiếm/mắt/mũ/shiny/chỉ số/customFace/customSprite bất kỳ lúc nào.' },
}
function t(k,...a){const m=I[k]?.[L]||I[k]?.['en']||k;return a.length?m.replace(/\{(\d+)\}/g,(_,i)=>a[+i]??''):m}

// ── Prompt helpers ───────────────────────────────────────
const ask = q => new Promise(r => { const rl = createInterface({input:process.stdin,output:process.stdout}); rl.question(q, a => { rl.close(); r(a.trim()) }) })
async function sel(title, items, skip=false) {
  console.log(`\n  ${c(E.b,title)}\n`)
  items.forEach((it,i) => console.log(`    ${c(E.c,`[${i+1}]`)} ${it}`))
  if (skip) console.log(`    ${c(E.d,`[Enter] ${t('si_any')}`)}`)
  const a = await ask(`\n  ${c(E.c,'>')} `)
  if (a===''&&skip) return -1
  const idx = parseInt(a)-1
  return idx>=0&&idx<items.length ? idx : (skip?-1:0)
}
async function yn(q, def=true) { const a = await ask(`  ${q} `); return a===''?def:a.toLowerCase().startsWith('y') }

// ── Language ─────────────────────────────────────────────
function loadLang(){const i=process.argv.indexOf('--lang');if(i!==-1){const v=(process.argv[i+1]||'').toLowerCase();return(v==='vi'||v==='zh'||v==='cn')?'vi':'en'}try{const d=JSON.parse(readFileSync(PREF_PATH,'utf8'));if(d.lang==='vi'||d.lang==='zh'||d.lang==='en')return d.lang==='zh'?'vi':d.lang}catch{}return null}
function saveLang(l){writeFileSync(PREF_PATH,JSON.stringify({lang:l},null,2),'utf8')}
async function pickLang(){console.log('');console.log(c(E.b+E.c,'  🎰 Claude Buddy Reroller')+c(E.d,` v${VERSION}`));console.log(`\n  ${c(E.b,'🌐 Select language / Chọn ngôn ngữ:')}\n`);console.log(`    ${c(E.c,'[1]')} English`);console.log(`    ${c(E.c,'[2]')} Tiếng Việt`);const a=await ask(`\n  ${c(E.c,'>')} `);const l=a.trim()==='2'?'vi':'en';saveLang(l);console.log(c(E.g,`\n  ${l==='zh'?I.lang_saved.vi:I.lang_saved.en}`));return l}

// ── wyhash (pure JS, final v4) ───────────────────────────
const M64=(1n<<64n)-1n,WYP=[0xa0761d6478bd642fn,0xe7037ed1a0b428dbn,0x8ebc6af09c88c6e3n,0x589965cc75374cc3n]
function _mx(A,B){const r=(A&M64)*(B&M64);return((r>>64n)^r)&M64}
function _r8(p,i){return BigInt(p[i])|(BigInt(p[i+1])<<8n)|(BigInt(p[i+2])<<16n)|(BigInt(p[i+3])<<24n)|(BigInt(p[i+4])<<32n)|(BigInt(p[i+5])<<40n)|(BigInt(p[i+6])<<48n)|(BigInt(p[i+7])<<56n)}
function _r4(p,i){return BigInt(p[i])|(BigInt(p[i+1])<<8n)|(BigInt(p[i+2])<<16n)|(BigInt(p[i+3])<<24n)}
function _r3(p,i,k){return(BigInt(p[i])<<16n)|(BigInt(p[i+(k>>1)])<<8n)|BigInt(p[i+k-1])}
function wyhash(key,seed=0n){const len=key.length;seed=(seed^_mx(seed^WYP[0],WYP[1]))&M64;let a,b;if(len<=16){if(len>=4){a=((_r4(key,0)<<32n)|_r4(key,((len>>3)<<2)))&M64;b=((_r4(key,len-4)<<32n)|_r4(key,len-4-((len>>3)<<2)))&M64}else if(len>0){a=_r3(key,0,len);b=0n}else{a=0n;b=0n}}else{let i=len,p=0;if(i>48){let s1=seed,s2=seed;do{seed=_mx(_r8(key,p)^WYP[1],_r8(key,p+8)^seed);s1=_mx(_r8(key,p+16)^WYP[2],_r8(key,p+24)^s1);s2=_mx(_r8(key,p+32)^WYP[3],_r8(key,p+40)^s2);p+=48;i-=48}while(i>48);seed=(seed^s1^s2)&M64}while(i>16){seed=_mx(_r8(key,p)^WYP[1],_r8(key,p+8)^seed);i-=16;p+=16}a=_r8(key,p+i-16);b=_r8(key,p+i-8)}a=(a^WYP[1])&M64;b=(b^seed)&M64;const r=(a&M64)*(b&M64);a=r&M64;b=(r>>64n)&M64;return _mx((a^WYP[0]^BigInt(len))&M64,(b^WYP[1])&M64)}

// ── Hash / PRNG / Roll ──────────────────────────────────
const IS_BUN = typeof globalThis.Bun!=='undefined'
function hWy(s){return IS_BUN?Number(BigInt(Bun.hash(s))&0xffffffffn):Number(wyhash(Buffer.from(s,'utf8'))&0xffffffffn)}
function hFnv(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}

let HASH_MODE='wyhash'
const IS_WIN=process.platform==='win32'
function whichBin(name){try{const cmd=IS_WIN?`where ${name}`:`which ${name}`;return execSync(cmd,{timeout:3000,encoding:'utf8'}).trim().split(/\r?\n/)[0]}catch{return null}}
function detectHash(){const i=process.argv.indexOf('--hash');if(i!==-1){const v=(process.argv[i+1]||'').toLowerCase();return(v==='fnv'||v==='fnv1a')?'fnv1a':'wyhash'}try{const d=JSON.parse(readFileSync(PREF_PATH,'utf8'));if(d.hashMode)return d.hashMode}catch{}try{const w=whichBin('claude');if(w){const r=realpathSync(w);if(r.includes('node_modules')||r.endsWith('.js'))return'fnv1a'}}catch{}if(findCliJs())return'fnv1a';return'wyhash'}
function hash(s){return HASH_MODE==='fnv1a'?hFnv(s):hWy(s)}

function prng(seed){let a=seed>>>0;return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function pick(rng,arr){return arr[Math.floor(rng()*arr.length)]}
function rollRar(rng){let r=rng()*100;for(const x of RARITIES){r-=RARITY_W[x];if(r<0)return x}return'common'}
function rollStats(rng,rar){const fl=RARITY_FLOOR[rar],pk=pick(rng,STATS);let dp=pick(rng,STATS);while(dp===pk)dp=pick(rng,STATS);const s={};for(const n of STATS){if(n===pk)s[n]=Math.min(100,fl+50+Math.floor(rng()*30));else if(n===dp)s[n]=Math.max(1,fl-10+Math.floor(rng()*15));else s[n]=Math.min(100,fl+Math.floor(rng()*40))}return s}
function roll(uid,salt=SALT,hashFn=hash){const rng=prng(hashFn(uid+salt)),rar=rollRar(rng);return{rarity:rar,species:pick(rng,SPECIES),eye:pick(rng,EYES),hat:rar==='common'?'none':pick(rng,HATS),shiny:rng()<0.01,stats:rollStats(rng,rar)}}

// ── Display ──────────────────────────────────────────────
function bar(v,w=20){const f=Math.round((v/100)*w);return`${c(v>=80?E.g:v>=50?E.y:v>=30?E.w:E.r,'█'.repeat(f)+'░'.repeat(w-f))} ${v}`}
function fmt(b,uid,verbose=true){const ln=[''],rC=RC[b.rarity];ln.push(c(rC+E.b,`  ${SP_E[b.species]||'?'} ${b.species.toUpperCase()}`));ln.push(c(rC,`  ${RAR_S[b.rarity]} ${b.rarity}`)+(b.shiny?c(E.y+E.b,' ✨ SHINY!'):'')); ln.push(c(E.gr,`  Eyes: ${b.eye}  |  Hat: ${HAT_E[b.hat]} ${b.hat}`));if(verbose){ln.push('');for(const[n,v]of Object.entries(b.stats))ln.push(`  ${n.padEnd(10)} ${bar(v)}`)}if(uid){ln.push('');ln.push(c(E.d,`  UserID: ${uid}`))}ln.push('');return ln.join('\n')}
function banner(){console.log('');console.log(c(E.b+E.c,`  ${t('banner')}`)+c(E.d,` v${VERSION}`));const h=HASH_MODE==='fnv1a'?'FNV-1a (npm)':'wyhash (native)';console.log(c(E.d,`  ${IS_BUN?t('rt_bun'):t('rt_node')} | Hash: ${h}`));console.log('')}

// ── Config / Version ─────────────────────────────────────
function readCfg(){if(!existsSync(CONFIG_PATH))return null;try{return JSON.parse(readFileSync(CONFIG_PATH,'utf8'))}catch{return null}}
function cmpVer(a,b){const pa=a.split('.').map(Number),pb=b.split('.').map(Number);for(let i=0;i<3;i++){if((pa[i]||0)>(pb[i]||0))return 1;if((pa[i]||0)<(pb[i]||0))return-1}return 0}
function getCCVer(){try{for(const p of [join(homedir(),'.local','bin','claude'),'/usr/local/bin/claude']){if(!existsSync(p))continue;try{const m=realpathSync(p).match(/(\d+\.\d+\.\d+)/);if(m)return m[1]}catch{}}const d=join(homedir(),'.local','share','claude','versions');if(existsSync(d)){const v=readdirSync(d).filter(f=>/^\d+\.\d+\.\d+$/.test(f)).sort(cmpVer);if(v.length)return v[v.length-1]}}catch{}try{const m=execSync('claude --version',{timeout:5000,encoding:'utf8'}).match(/(\d+\.\d+\.\d+)/);if(m)return m[1]}catch{}return null}
function chkVer(){const v=getCCVer();if(!v){console.log(c(E.y,`  ${t('v_unk',MIN_CC_VER)}`));return'unknown'}if(cmpVer(v,MIN_CC_VER)<0){console.log(c(E.r+E.b,`  ${t('v_old',v,MIN_CC_VER)}`));return'outdated'}console.log(c(E.d,`  ${t('v_ok',v)}`));return'ok'}

// ── Shared: pet selection UI ─────────────────────────────
async function selectPet() {
  const spIdx = await sel(t('si_species'), SPECIES.map(s=>`${SP_E[s]}  ${s}`), true)
  const rarIdx = await sel(t('si_rarity'), [t('si_auto'), ...RARITIES.map(r=>`${c(RC[r],RAR_S[r])} ${r} (${RARITY_W[r]}%)`)])
  const eyeIdx = await sel(t('si_eye'), EYES.map(e=>`  ${e}`), true)
  const hatIdx = await sel(t('si_hat'), HATS.map(h=>`${HAT_E[h]}  ${h}`), true)
  const shA = await ask(`\n  ${t('si_shiny')} `)

  // ── Stats section ──────────────────────────────────────
  console.log(`\n  ${c(E.b,'─── Stats Filter ───')}`)
  console.log(`  ${c(E.d, t('si_pts_hint'))}`)
  const ptsA = await ask(`  ${t('si_pts')} `)
  const statReqs = {}
  while (true) {
    const statIdx = await sel(t('si_stat_name'), STATS.map(n=>`  ${n}`), true)
    if (statIdx < 0) break
    const statName = STATS[statIdx]
    const valA = await ask(`  ${t('si_stat_val', statName)} `)
    if (valA.trim() === '') break
    const v = parseInt(valA)
    if (!isNaN(v) && v >= 0 && v <= 100) statReqs[statName] = v
    else console.log(c(E.y, `  ⚠ Value must be 0–100, skipped.`))
  }
  if (!Object.keys(statReqs).length) Object.assign(statReqs, null)

  // ── Performance / Apply options ────────────────────────
  console.log(`\n  ${c(E.b,'─── Options ───')}`)
  const parA = await ask(`  ${t('si_parallel')} `)
  const applyA = await ask(`  ${t('si_auto_apply')} `)
  const unlimA = await ask(`  ${t('si_unlimited')} `)

  const cr = {}
  if (spIdx>=0) cr.species = SPECIES[spIdx]
  if (rarIdx>0) cr.rarity = RARITIES[rarIdx-1]
  if (eyeIdx>=0) cr.eye = EYES[eyeIdx]
  if (hatIdx>=0) cr.hat = HATS[hatIdx]
  if (shA.toLowerCase().startsWith('y')) cr.shiny = true
  if (!Object.keys(cr).length && Object.keys(statReqs||{}).length === 0 && !ptsA) cr.rarity = 'legendary'
  if (ptsA.trim()) { const v = parseInt(ptsA); if (!isNaN(v) && v >= 0 && v <= 500) cr.minPoints = v }
  cr.statReqs = Object.keys(statReqs||{}).length ? statReqs : null
  cr._interactive = { parallel: parA.toLowerCase().startsWith('y'), autoApply: applyA.toLowerCase().startsWith('y'), unlimited: unlimA.toLowerCase().startsWith('y') }
  return cr
}

function criteriaLabel(cr) {
  const p = []
  if(cr.shiny)p.push('✨'); if(cr.rarity)p.push(cr.rarity)
  if(cr.species)p.push(`${SP_E[cr.species]} ${cr.species}`)
  if(cr.eye)p.push(`eye:${cr.eye}`); if(cr.hat)p.push(`hat:${cr.hat}`)
  if (cr.minPoints) p.push(`pts≥${cr.minPoints}`)
  if (cr.statReqs) for (const [n, v] of Object.entries(cr.statReqs)) p.push(`${n}≥${v}`)
  return p.join(' ')
}

// ── Stats criteria builder ───────────────────────────────
function buildCriteriaFromArgs(args) {
  const errors = []
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

function matchStats(buddy, statReqs, minPoints) {
  if (statReqs) {
    for (const [name, min] of Object.entries(statReqs)) {
      if ((buddy.stats[name] ?? -1) < min) return false
    }
  }
  if (minPoints != null) {
    const total = Object.values(buddy.stats).reduce((a, b) => a + b, 0)
    if (total < minPoints) return false
  }
  return true
}

// ── Search engine (unified) ──────────────────────────────
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

function search(cr, limit=100_000_000, saltOverride=null, unlimited=false) {
  const results=[],start=Date.now();let best=null
  const hashFn = saltOverride ? hWy : hash  // native always wyhash
  const useSalt = saltOverride || SALT
  let i = 0
  while(unlimited ? true : i < limit){
    const uid=randomBytes(32).toString('hex')
    const buddy=roll(uid, useSalt, hashFn)
    i++
    if(match(buddy,cr)){
      if(!cr.rarity){
        if(!best||RARITY_RANK[buddy.rarity]>RARITY_RANK[best.buddy.rarity]){
          best={uid,buddy,attempts:i};results.push(best)
          console.log(c(RC[buddy.rarity],`  ${t('s_found')} ${RAR_S[buddy.rarity]} ${buddy.rarity} ${buddy.species}${buddy.shiny?' ✨':''}`+c(E.d,` @ ${i.toLocaleString()}`)))
          if(buddy.rarity==='legendary')break
        }
      } else {
        results.push({uid,buddy,attempts:i})
        console.log(c(RC[buddy.rarity],`  ${t('s_found')} ${RAR_S[buddy.rarity]} ${buddy.rarity} ${buddy.species}${buddy.shiny?' ✨':''}`+c(E.d,` @ ${i.toLocaleString()}`)))
        break
      }
    }
    if(i>0&&i%500_000===0&&TTY)console.log(c(E.d,`  ... ${i.toLocaleString()} (${((Date.now()-start)/1000).toFixed(1)}s) ...`))
  }
  const elapsed = ((Date.now()-start)/1000).toFixed(2)
  console.log(c(E.d,`\n  ${t('s_done',unlimited ? i.toLocaleString() : limit.toLocaleString(),elapsed)}`))
  return results
}

// ── Parallel search ──────────────────────────────────────

async function parallelSearch(cr, limit, saltOverride) {
  const numCPUs = Math.max(1, cpus().length)
  const workers = numCPUs >= 2 ? numCPUs : 1
  const unlimited = !isFinite(limit)
  // For unlimited mode, give each worker a huge finite chunk so they keep running
  const chunkSize = unlimited ? 100_000_000 : Math.ceil(limit / workers)
  const RARITY_RANK_MAP = { common:0, uncommon:1, rare:2, epic:3, legendary:4 }

  console.log(c(E.c, `  ⚡ ${workers} workers active (${numCPUs} cores)\n`))

  // Worker script — written to temp file then forked
  const workerScript = `
'use strict'
const { randomBytes } = require('node:crypto')
const M64 = (1n<<64n)-1n
const WYP = [0xa0761d6478bd642fn,0xe7037ed1a0b428dbn,0x8ebc6af09c88c6e3n,0x589965cc75374cc3n]
function _mx(A,B){const r=(A&M64)*(B&M64);return((r>>64n)^r)&M64}
function _r8(p,i){return BigInt(p[i])|(BigInt(p[i+1])<<8n)|(BigInt(p[i+2])<<16n)|(BigInt(p[i+3])<<24n)|(BigInt(p[i+4])<<32n)|(BigInt(p[i+5])<<40n)|(BigInt(p[i+6])<<48n)|(BigInt(p[i+7])<<56n)}
function _r4(p,i){return BigInt(p[i])|(BigInt(p[i+1])<<8n)|(BigInt(p[i+2])<<16n)|(BigInt(p[i+3])<<24n)}
function _r3(p,i,k){return(BigInt(p[i])<<16n)|(BigInt(p[i+(k>>1)])<<8n)|BigInt(p[i+k-1])}
function wyhash(key,seed=0n){
  const len=key.length;seed=(seed^_mx(seed^WYP[0],WYP[1]))&M64;let a,b
  if(len<=16){
    if(len>=4){a=((_r4(key,0)<<32n)|_r4(key,((len>>3)<<2)))&M64;b=((_r4(key,len-4)<<32n)|_r4(key,len-4-((len>>3)<<2)))&M64}
    else if(len>0){a=_r3(key,0,len);b=0n}else{a=0n;b=0n}
  }else{
    let i=len,p=0
    if(i>48){let s1=seed,s2=seed;do{seed=_mx(_r8(key,p)^WYP[1],_r8(key,p+8)^seed);s1=_mx(_r8(key,p+16)^WYP[2],_r8(key,p+24)^s1);s2=_mx(_r8(key,p+32)^WYP[3],_r8(key,p+40)^s2);p+=48;i-=48}while(i>48);seed=(seed^s1^s2)&M64}
    while(i>16){seed=_mx(_r8(key,p)^WYP[1],_r8(key,p+8)^seed);i-=16;p+=16}
    a=_r8(key,p+i-16);b=_r8(key,p+i-8)
  }
  a=(a^WYP[1])&M64;b=(b^seed)&M64;const r=(a&M64)*(b&M64);a=r&M64;b=(r>>64n)&M64
  return _mx((a^WYP[0]^BigInt(len))&M64,(b^WYP[1])&M64)
}
function hWy(s){return Number(wyhash(Buffer.from(s,'utf8'))&0xffffffffn)}
function prng(seed){let a=seed>>>0;return()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
const RARITIES=['common','uncommon','rare','epic','legendary']
const STATS=['DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK']
const RARITY_W={common:60,uncommon:25,rare:10,epic:4,legendary:1}
const SPECIES=['duck','goose','blob','cat','dragon','octopus','owl','penguin','turtle','snail','ghost','axolotl','capybara','cactus','robot','rabbit','mushroom','chonk']
const EYES=['·','✦','×','◉','@','°']
const HATS=['none','crown','tophat','propeller','halo','wizard','beanie','tinyduck']
const RARITY_FLOOR={common:5,uncommon:15,rare:25,epic:35,legendary:50}
function pick(rng,arr){return arr[Math.floor(rng()*arr.length)]}
function rollRar(rng){let r=rng()*100;for(const x of RARITIES){r-=RARITY_W[x];if(r<0)return x}return'common'}
function rollStats(rng,rar){
  const fl=RARITY_FLOOR[rar],pk=pick(rng,STATS);let dp=pick(rng,STATS)
  while(dp===pk)dp=pick(rng,STATS)
  const s={}
  for(const n of STATS){
    if(n===pk)s[n]=Math.min(100,fl+50+Math.floor(rng()*30))
    else if(n===dp)s[n]=Math.max(1,fl-10+Math.floor(rng()*15))
    else s[n]=Math.min(100,fl+Math.floor(rng()*40))
  }
  return s
}
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
process.on('message', msg => { if(msg.type==='STOP') stopped=true })

const salt = process.env.__CCBUDDY_SALT || 'friend-2026-401'
const cr = JSON.parse(process.env.__CCBUDDY_CR || '{}')
const unlimited = process.env.__CCBUDDY_UNLIMITED === '1'
const limit = unlimited ? Infinity : (parseInt(process.env.__CCBUDDY_LIMIT || '5000000') || 5000000)
let attempts = 0

if (unlimited) {
  while(!stopped){
    const uid = randomBytes(32).toString('hex')
    const buddy = roll(uid, salt)
    attempts++
    if(matchBuddy(buddy, cr)){
      process.send({type:'FOUND', uid, buddy, attempts, searchId: process.env.__CCBUDDY_SEARCH_ID})
    }
  }
  process.send({type:'DONE', attempts, searchId: process.env.__CCBUDDY_SEARCH_ID})
} else {
  for(let i=0; i<limit && !stopped; i++){
    const uid = randomBytes(32).toString('hex')
    const buddy = roll(uid, salt)
    attempts++
    if(matchBuddy(buddy, cr)){
      process.send({type:'FOUND', uid, buddy, attempts, searchId: process.env.__CCBUDDY_SEARCH_ID})
    }
  }
  process.send({type:'DONE', attempts, searchId: process.env.__CCBUDDY_SEARCH_ID})
}
`

  // Write worker to temp file — fork() needs a file path
  const workerPath = join(tmpdir(), `ccbuddy-worker-${process.pid}-${Date.now()}.js`)

  // Search iteration ID — incremented each call to detect stale messages
  const searchId = { v: (globalThis.__ccbuddySearchId || 0) + 1 }
  globalThis.__ccbuddySearchId = searchId.v

  // Increment before spawning so workers get the current ID
  const spawnSearchId = String(searchId.v)
  writeFileSync(workerPath, workerScript)

  return new Promise((resolve) => {
    const results = []
    let activeWorkers = workers
    let resolved = false
    const start = Date.now()
    const children = []

    const killAll = () => {
      for (const c of children) {
        try { c.send({ type: 'STOP' }) } catch {}
        try { c.kill('SIGKILL') } catch {}
      }
      try { unlinkSync(workerPath) } catch {}
    }

    const spawnWorker = (id) => {
      const child = fork(workerPath, {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          __CCBUDDY_SALT: saltOverride || SALT,
          __CCBUDDY_CR: JSON.stringify(cr),
          __CCBUDDY_LIMIT: chunkSize.toString(),
          __CCBUDDY_UNLIMITED: unlimited ? '1' : '0',
          __CCBUDDY_SEARCH_ID: spawnSearchId,
        }
      })

      child.on('message', (msg) => {
        if (resolved) return  // Ignore messages from previous search
        if (msg.type === 'FOUND') {
          // Ignore stale messages from workers of a previous search iteration
          if (String(msg.searchId) !== spawnSearchId) return
          const rarityRank = RARITY_RANK_MAP[msg.buddy.rarity]
          const stars = '★'.repeat(rarityRank + 1)
          console.log(c(E.c, `  [Worker ${id}] → Found: ${stars} ${msg.buddy.rarity} ${msg.buddy.species}${msg.buddy.shiny?' ✨':''} @ ${msg.attempts.toLocaleString()}`))

          if (!cr.rarity) {
            if (results.length === 0 || rarityRank > RARITY_RANK_MAP[results[0]?.buddy.rarity]) {
              results.length = 0
            }
            if (results.length === 0 || rarityRank >= RARITY_RANK_MAP[results[0]?.buddy.rarity]) {
              results.push({ uid: msg.uid, buddy: msg.buddy, attempts: msg.attempts })
            }
          } else {
            results.push({ uid: msg.uid, buddy: msg.buddy, attempts: msg.attempts })
          }

          // Stop all workers on first match — found what we want
          killAll()
          const elapsed = ((Date.now() - start) / 1000).toFixed(2)
          console.log(c(E.d, `\n  ✓ Match found after ${msg.attempts.toLocaleString()} attempts in ${elapsed}s\n`))
          resolved = true
          resolve(results)
        } else if (msg.type === 'DONE') {
          if (String(msg.searchId) !== spawnSearchId) return  // stale
          activeWorkers--
          if (activeWorkers === 0 && !resolved) {
            try { unlinkSync(workerPath) } catch {}
            const elapsed = ((Date.now() - start) / 1000).toFixed(2)
            console.log(c(E.d, `\n  Searched ~${(workers * chunkSize).toLocaleString()} in ${elapsed}s`))
            resolve(results)
          }
        }
      })

      child.on('error', () => {
        activeWorkers--
        if (activeWorkers === 0 && !resolved) {
          try { unlinkSync(workerPath) } catch {}
          resolve(results)
        }
      })
      child.on('exit', (code) => {
        if (!resolved) { activeWorkers-- }
        if (activeWorkers === 0 && !resolved) {
          try { unlinkSync(workerPath) } catch {}
          const elapsed = ((Date.now() - start) / 1000).toFixed(2)
          console.log(c(E.d, `\n  Searched ~${(workers * chunkSize).toLocaleString()} in ${elapsed}s`))
          resolve(results)
        }
      })

      children.push(child)
      return child
    }

    Array.from({ length: workers }, (_, i) => spawnWorker(i + 1))
  })
}

// ── Install detection ────────────────────────────────────
function findCliJs(){const cands=[];try{const o=execSync('npm root -g',{timeout:5000,encoding:'utf8'}).trim();if(o&&!o.includes('Unknown'))cands.push(join(o,'@anthropic-ai','claude-code','cli.js'))}catch{}cands.push(join(homedir(),'.npm-global','lib','node_modules','@anthropic-ai','claude-code','cli.js'),join('/usr','local','lib','node_modules','@anthropic-ai','claude-code','cli.js'),join(process.env.APPDATA||'','npm','node_modules','@anthropic-ai','claude-code','cli.js'));for(const p of cands)if(existsSync(p))return p;return null}

function findNative(){const home=homedir(),cands=[join(home,'.local','bin','claude'),join(home,'.claude','local','claude'),'/usr/local/bin/claude'];const la=process.env.LOCALAPPDATA||'';if(la)cands.push(join(la,'Programs','ClaudeCode','claude.exe'));for(const p of cands){if(!existsSync(p))continue;try{const r=realpathSync(p);if(r.endsWith('.js')||r.includes('node_modules'))continue;return r}catch{}}const vd=join(home,'.local','share','claude','versions');if(existsSync(vd)){const vs=readdirSync(vd).filter(f=>/^\d+\.\d+\.\d+$/.test(f)).sort(cmpVer);if(vs.length)return join(vd,vs[vs.length-1])}return null}

function detectInstall(){const cli=findCliJs(),bin=findNative();if(cli){try{const w=whichBin('claude');if(w){const r=realpathSync(w);if(r.includes('node_modules')||r.endsWith('.js'))return{mode:'npm',cli,bin}}}catch{}return{mode:bin?'native':'npm',cli,bin}}return{mode:bin?'native':null,cli,bin}}

function detectEnvMisconfig(){const evs={...process.env};for(const sp of [join(homedir(),'.claude','settings.json'),join(process.cwd(),'.claude','settings.json')]){try{const s=JSON.parse(readFileSync(sp,'utf8'));if(s.env)Object.assign(evs,s.env)}catch{}}const hasUrl=!!evs.ANTHROPIC_BASE_URL;const cloud=[evs.CLAUDE_CODE_USE_BEDROCK==='1'&&'BEDROCK',evs.CLAUDE_CODE_USE_VERTEX==='1'&&'VERTEX',evs.CLAUDE_CODE_USE_FOUNDRY==='1'&&'FOUNDRY'].filter(Boolean);if(hasUrl&&cloud.length)return t('env_warn',cloud.join(', '));return null}

// ── npm patches ──────────────────────────────────────────
// Structural regex: captures getCompanion() variable names dynamically — survives minifier renames
// P_GETCOMP: original {stored,bones} | P_GETCOMP_S: old spread-swapped {bones,stored}
const P_GETCOMP=/function (\w+)\(\)\{let (\w+)=(\w+\(\))\.companion;if\(!\2\)return;let\{bones:(\w+)\}=(\w+\(\w+\(\)\));return\{\.\.\.\2,\.\.\.\4\}\}/
const P_GETCOMP_S=/function (\w+)\(\)\{let (\w+)=(\w+\(\))\.companion;if\(!\2\)return;let\{bones:(\w+)\}=(\w+\(\w+\(\)\));return\{\.\.\.\4,\.\.\.\2\}\}/
const P_TELE=/if\(\w+\(\)!=="firstParty"\)return null;if\((\w+)\(\)\)return null;(let \w=\w+\(\))/
const P_BUDDY=/function (\w+)\(\)\{if\(\w+\(\)!=="firstParty"\)return!1;if\(\w+\(\)\)return!1;let \w+=new Date;return \w+\.getFullYear\(\)>2026\|\|\w+\.getFullYear\(\)===2026&&\w+\.getMonth\(\)>=3\}/
const P_BUDDY_DONE=/function \w+\(\)\{return!0\}/
const P_TELE_DONE=/if\(\w+\(\)!=="firstParty"\)return null;let \w+=\w+\(\)/
const P_RENDER_SPRITE=/let (\w+)=(\w+)\[(\w+)\.species\],/
const P_SPRITE_COUNT=/function (\w+)\((\w+)\)\{return (\w+)\[\2\]\.length\}/
const P_RENDER_FACE=/let (\w+)=(\w+)\.eye;switch\(\2\.species\)\{/

function npmPatchAll(cliPath){
  const bak=cliPath+'.original';if(!existsSync(bak))copyFileSync(cliPath,bak)
  let f=readFileSync(cliPath,'utf8'),changed=false
  const applied=[]
  // 1. Custom attributes: inject companionOverride support into getCompanion()
  let cfgCall=null
  const gm=f.match(P_GETCOMP)||f.match(P_GETCOMP_S)
  if(gm){
    const[full,fn,cv,cc,bv,rc]=gm
    cfgCall=cc
    const patched=`function ${fn}(){let ${cv}=${cc}.companion;if(!${cv})return;let{bones:${bv}}=${rc};`+
      `var _ccbov=${cc}.companionOverride;`+
      `if(_ccbov){`+
        `if(_ccbov.stats)${bv}.stats=Object.assign({},${bv}.stats,_ccbov.stats);`+
        `var _ccbst=${bv}.stats;`+
        `Object.assign(${bv},_ccbov);`+
        `${bv}.stats=_ccbov.stats?Object.assign({},_ccbst,_ccbov.stats):_ccbst;`+
        `delete ${bv}.customSprite;delete ${bv}.customFace`+
      `}`+
      `return{...${cv},...${bv}}}`
    f=f.replace(full,patched);changed=true;applied.push('getCompanion')
    console.log(c(E.g,`  ✓ ${L==='vi'?'Thuộc tính tùy chỉnh (companionOverride)':'Custom attributes (companionOverride)'}`))
  } else if(f.includes('_ccbov')&&f.includes('companionOverride')){
    applied.push('getCompanion')
    console.log(c(E.g,`  ✓ ${L==='vi'?'Thuộc tính tùy chỉnh (đã áp dụng)':'Custom attributes (already applied)'}`))
    const ccm=f.match(/_ccbov=(\w+\(\))\.companionOverride/);if(ccm)cfgCall=ccm[1]
  } else console.log(c(E.y,`  ${t('p_unk_attr')}`))
  // 2. Buddy unlock
  if(P_BUDDY.test(f)){const m=f.match(P_BUDDY);if(m){f=f.replace(P_BUDDY,`function ${m[1]}(){return!0}`);changed=true;applied.push('buddyLive');console.log(c(E.g,`  ✓ ${L==='vi'?'Mở khóa /buddy':'/buddy unlocked'}`))}}
  else if(P_BUDDY_DONE.test(f)){applied.push('buddyLive');console.log(c(E.g,`  ✓ ${L==='vi'?'/buddy đã mở (đã áp dụng)':'/buddy unlocked (already applied)'}`))}
  else console.log(c(E.y,`  ${t('p_unk_buddy')}`))
  // 3. Telemetry bypass
  if(P_TELE.test(f)){const m=f.match(P_TELE);if(m){f=f.replace(P_TELE,(x,tf,lp)=>x.replace(`if(${tf}())return null;${lp}`,lp));changed=true;applied.push('buddyReact');console.log(c(E.g,`  ✓ ${L==='vi'?'Bong bóng chat':'Speech bubbles'}`))}}
  else if(P_TELE_DONE.test(f)){applied.push('buddyReact');console.log(c(E.g,`  ✓ ${L==='vi'?'Bong bóng chat (đã áp dụng)':'Speech bubbles (already applied)'}`))}
  else console.log(c(E.y,`  ${t('p_unk_tele')}`))
  // 4. renderSprite: customSprite fallback
  if(cfgCall){
    const rsm=f.match(P_RENDER_SPRITE)
    if(rsm&&!f.includes('_csp&&Array')){
      const[full,frV,bodies,bonesP3]=rsm
      const rep=`var _csp=${cfgCall}.companionOverride;let ${frV}=(_csp&&Array.isArray(_csp.customSprite)&&_csp.customSprite.length>0)?_csp.customSprite:${bodies}[${bonesP3}.species],`
      f=f.replace(full,rep);changed=true;applied.push('renderSprite')
      console.log(c(E.g,`  ✓ ${L==='vi'?'Tùy chỉnh sprite (customSprite)':'Custom sprite (customSprite)'}`))
    } else if(f.includes('customSprite')){applied.push('renderSprite');console.log(c(E.g,`  ✓ ${L==='vi'?'Sprite tùy chỉnh (đã áp dụng)':'Custom sprite (already applied)'}`))}
  }
  // 5. spriteFrameCount: customSprite length
  if(cfgCall){
    const scm=f.match(P_SPRITE_COUNT)
    if(scm&&scm[0].length<90&&!f.includes('_csp3&&Array')){
      const[full,fn2,sp,bodies2]=scm
      f=f.replace(full,`function ${fn2}(${sp}){var _csp3=${cfgCall}.companionOverride;if(_csp3&&Array.isArray(_csp3.customSprite)&&_csp3.customSprite.length>0)return _csp3.customSprite.length;return ${bodies2}[${sp}].length}`);changed=true;applied.push('spriteFrameCount')
      console.log(c(E.g,`  ✓ ${L==='vi'?'Số khung sprite (customSprite)':'Sprite frame count (customSprite)'}`))
    } else if(f.includes('_csp3&&Array'))applied.push('spriteFrameCount')
  }
  // 6. renderFace: customFace fallback
  if(cfgCall){
    const rfm=f.match(P_RENDER_FACE)
    if(rfm&&!f.includes('_cf4&&typeof')){
      const[full,eyeV,bonesP4]=rfm
      f=f.replace(full,`var _cf4=${cfgCall}.companionOverride;if(_cf4&&typeof _cf4.customFace==="string")return _cf4.customFace.replaceAll("{E}",${bonesP4}.eye);${full}`);changed=true;applied.push('renderFace')
      console.log(c(E.g,`  ✓ ${L==='vi'?'Tùy chỉnh mặt (customFace)':'Custom face (customFace)'}`))
    } else if(f.includes('customFace')){applied.push('renderFace');console.log(c(E.g,`  ✓ ${L==='vi'?'Mặt tùy chỉnh (đã áp dụng)':'Custom face (already applied)'}`))}
  }
  // C. Control switches: inject globalThis.__buddyConfig status marker
  const CTRL_RE=/\n;globalThis\.__buddyConfig=\{[^;]+\};\/\*__ccbuddy__\*\/\n/
  f=f.replace(CTRL_RE,'')
  const unlocked=applied.includes('buddyLive'),customized=applied.includes('getCompanion')
  f+=`\n;globalThis.__buddyConfig={unlocked:${unlocked},customized:${customized},version:"3.0",patches:${JSON.stringify(applied)},tool:"cc-buddy"};/*__ccbuddy__*/\n`
  changed=true
  writeFileSync(cliPath,f,'utf8')
}

// ── Native patches ───────────────────────────────────────
const P_SPREAD_B=/if\(!(\w)\)return;let\{bones:(\w)\}=\w+\(\w+\(\)\);return\{\.\.\.\1,\.\.\.\2\}/
const P_SPREAD_A=/if\(!(\w)\)return;let\{bones:(\w)\}=\w+\(\w+\(\)\);return\{\.\.\.\2,\.\.\.\1\}/
const N_BUDDY_RE=/function (\w+)\(\)\{if\(\w+\(\)!=="firstParty"\)return!1;if\(\w+\(\)\)return!1;let (\w)=new Date;return \2\.getFullYear\(\)>2026\|\|\2\.getFullYear\(\)===2026&&\2\.getMonth\(\)>=3\}/

function detectSalt(fp){const buf=readFileSync(fp),pats=[/friend-\d{4}-\d+/,/ccbf-\d{10}/];const chunk=10*1024*1024;for(let o=0;o<buf.length;o+=chunk-50){const s=buf.slice(o,Math.min(o+chunk,buf.length)).toString('ascii');for(const p of pats){const m=s.match(p);if(m)return{salt:m[0],len:m[0].length}}}return null}
function genSalt(){return`ccbf-${Math.floor(Date.now()/1000).toString().padStart(10,'0')}`}

function bufReplace(buf,oldStr,newStr){const oB=Buffer.from(oldStr),nB=Buffer.from(newStr);let p=0;while(true){const idx=buf.indexOf(oB,p);if(idx===-1)break;nB.copy(buf,idx);p=idx+1}}

function nativePatchAll(binPath,oldSalt,newSalt){
  const bak=binPath+'.pre-salt-patch';if(!existsSync(bak))copyFileSync(binPath,bak)
  if(process.platform==='darwin')try{execSync(`codesign --remove-signature "${binPath}"`,{timeout:10000,stdio:'pipe'})}catch{}
  let buf=readFileSync(binPath),content=buf.toString('ascii'),dirty=false
  // 1. Buddy unlock
  const bm=content.match(N_BUDDY_RE)
  if(bm){const orig=bm[0],fn=bm[1],pad=orig.length-`function ${fn}(){return!0}`.length;if(pad>=0){bufReplace(buf,orig,`function ${fn}(){return!0${';'.repeat(pad)}}`);dirty=true;console.log(c(E.g,`  ✓ ${L==='vi'?'Mở khóa /buddy':'/buddy unlocked'}`))}}
  // 2. Spread swap (same-length: {...X,...Y} → {...Y,...X})
  const sm=content.match(P_SPREAD_B)
  if(sm){const orig=sm[0],rep=orig.replace(`{...${sm[1]},...${sm[2]}}`,`{...${sm[2]},...${sm[1]}}`);bufReplace(buf,orig,rep);dirty=true;console.log(c(E.g,`  ✓ ${L==='vi'?'Thuộc tính tùy chỉnh':'Custom attributes'}`))}
  else if(P_SPREAD_A.test(content))console.log(c(E.g,`  ✓ ${L==='vi'?'Thuộc tính tùy chỉnh (đã áp dụng)':'Custom attributes (already applied)'}`))
  else console.log(c(E.y,`  ${t('p_unk_attr')}`))
  // 3. SALT swap
  const oS=Buffer.from(oldSalt),nS=Buffer.from(newSalt);let cnt=0,p=0
  while(true){const idx=buf.indexOf(oS,p);if(idx===-1)break;nS.copy(buf,idx);cnt++;p=idx+1}
  if(cnt>0){dirty=true;console.log(c(E.g,`  ✓ SALT: ${oldSalt} → ${newSalt} (${cnt}x)`))}
  // Write once
  if(dirty)writeFileSync(binPath,buf)
  // Re-sign
  if(process.platform==='darwin'){try{execSync(`codesign --force --sign - "${binPath}"`,{timeout:10000,stdio:'pipe'});console.log(c(E.g,`  ✓ ${L==='vi'?'Ký lại':'Re-signed'}`))}catch{console.log(c(E.r,`  ✗ codesign --force --sign - "${binPath}"`))}}
}

// ── Config writers ───────────────────────────────────────
function writeConfig(uid, buddy=null, soul=null){
  const cfg=readCfg()||{};if(existsSync(CONFIG_PATH))copyFileSync(CONFIG_PATH,CONFIG_PATH+`.bak.${Date.now()}`)
  if(cfg.oauthAccount?.accountUuid){const old=cfg.oauthAccount.accountUuid;delete cfg.oauthAccount.accountUuid;console.log(c(E.c,`  ${t('a_oauth')}`));console.log(c(E.d,`  Old UUID: ${old}`))}
  cfg.userID=uid
  cfg.companion={hatchedAt:cfg.companion?.hatchedAt||Date.now()}
  if(buddy){
    const bones={species:buddy.species,rarity:buddy.rarity,eye:buddy.eye,hat:buddy.hat,shiny:buddy.shiny,stats:buddy.stats}
    cfg.companionOverride=bones                   // npm: injected code reads this
    Object.assign(cfg.companion,bones)             // native: spread swap reads this
  }
  if(soul?.name)cfg.companion.name=soul.name
  if(soul?.personality)cfg.companion.personality=soul.personality
  if(soul?.name)console.log(c(E.m,`  ${t('diy_set',soul.name)}`))
  else console.log(c(E.d,`  ${t('diy_auto')}`))
  writeFileSync(CONFIG_PATH,JSON.stringify(cfg,null,2),'utf8')
  console.log(c(E.g+E.b,`  ${t('a_ok')}`))
}

function writeSoul(name,pers){const cfg=readCfg();if(!cfg?.companion)return false;if(existsSync(CONFIG_PATH))copyFileSync(CONFIG_PATH,CONFIG_PATH+`.bak.${Date.now()}`);if(name)cfg.companion.name=name;if(pers)cfg.companion.personality=pers;writeFileSync(CONFIG_PATH,JSON.stringify(cfg,null,2),'utf8');return true}

// ── Interactive: Search & Apply (main flow) ──────────────
async function interactiveSearch(){
  const{mode,cli,bin}=detectInstall()
  let nSalt=null,newSalt=null
  if(mode==='native'&&bin){nSalt=detectSalt(bin);if(nSalt)newSalt=genSalt()}
  const ew=detectEnvMisconfig();if(ew)console.log(c(E.y,`  ${ew}\n`))

  const cr=await selectPet()
  console.log(`\n  ${c(E.b,`${t('s_target')} ${criteriaLabel(cr)}`)}\n`)

  const useParallel = cr._interactive?.parallel
  const useAutoApply = cr._interactive?.autoApply
  const useUnlimited = cr._interactive?.unlimited
  delete cr._interactive

  let results
  if (useUnlimited) {
    if (useParallel) {
      results = await parallelSearch(cr, Infinity, mode==='native'?newSalt:null)
    } else {
      results = search(cr, Infinity, mode==='native'?newSalt:null, true)
    }
  } else {
    if (useParallel) {
      results = await parallelSearch(cr, 100_000_000, mode==='native'?newSalt:null)
    } else {
      results = search(cr, 100_000_000, mode==='native'?newSalt:null)
    }
  }
  if(!results.length){console.log(c(E.r+E.b,`\n  ${t('s_none')}\n`));return}

  const best=results[results.length-1]
  console.log(c(E.g+E.b,'\n  ════════════════════════════════════'))
  console.log(c(E.g+E.b,`  ${t('s_best')}`))
  console.log(c(E.g+E.b,'  ════════════════════════════════════'))
  console.log(fmt(best.buddy,best.uid))

  if(!useAutoApply && !(await yn(t('si_apply'),true))){console.log(c(E.d,`\n  ${t('si_skip')}\n`));return}

  console.log('')
  const nm=await ask(`  ${c(E.m,'✏️')} ${t('diy_name')} `)
  const ps=nm?await ask(`  ${c(E.m,'✏️')} ${t('diy_pers')} `):''
  const soul=(nm||ps)?{name:nm,personality:ps}:null

  if(mode==='npm'&&cli){npmPatchAll(cli);writeConfig(best.uid,best.buddy,soul)}
  else if(mode==='native'&&bin&&newSalt&&nSalt){nativePatchAll(bin,nSalt.salt,newSalt);writeConfig(best.uid,best.buddy,soul)}
  else{if(mode==='native')console.log(c(E.y,`  ${t('n_skip')}`));writeConfig(best.uid,best.buddy,soul)}

  console.log(c(E.g+E.b,`\n  ${t('si_done')}`))
  console.log(c(E.d,`  ${t('tip_override')}\n`))
}

// ── Interactive: Check ───────────────────────────────────
function interactiveCheck(){
  const cfg=readCfg();if(!cfg){console.log(c(E.y,`\n  ${t('chk_none')}\n`));return}
  const oa=cfg.oauthAccount?.accountUuid,uid=cfg.userID
  if(oa){console.log(c(E.b,`\n  ${t('chk_oauth')}`));console.log(fmt(roll(oa),oa));console.log(c(E.y,`  ${t('chk_oauth_w')}\n`));if(uid){console.log(c(E.b,`  ${t('chk_after')}`));console.log(fmt(roll(uid),uid))}}
  else if(uid){console.log(c(E.b,`\n  ${t('chk_cur')}`));console.log(fmt(roll(uid),uid))}
  else console.log(c(E.r,`\n  ${t('chk_no_id')}\n`))
  chkVer()
}

// ── Interactive: Gallery ─────────────────────────────────
function interactiveGallery(){
  console.log(c(E.b,`\n  ${t('gal_sp')}\n`));for(const s of SPECIES)console.log(`    ${SP_E[s]}  ${s}`)
  console.log(c(E.b,`\n  ${t('gal_rar')}\n`));for(const r of RARITIES){const p=RARITY_W[r];console.log(`    ${c(RC[r],`${RAR_S[r].padEnd(6)} ${r.padEnd(10)}`)} ${'█'.repeat(Math.ceil(p/3))+'░'.repeat(20-Math.ceil(p/3))} ${p}%`)}
  console.log(c(E.b,`\n  ${t('gal_eye')}\n`));console.log(`    ${EYES.join('  ')}`)
  console.log(c(E.b,`\n  ${t('gal_hat')}\n`));for(const h of HATS)console.log(`    ${HAT_E[h]}  ${h}`)
  console.log(c(E.d,`\n  ${t('gal_note')}\n`))
}

// ── Interactive: Selftest ────────────────────────────────
function interactiveSelftest(){
  console.log(c(E.b,`\n  ${t('t_title')}\n`));const tests=['hello','test-id'+SALT,randomBytes(32).toString('hex')+SALT];let ok=true
  for(const s of tests){const js=Number(wyhash(Buffer.from(s,'utf8'))&0xffffffffn);if(IS_BUN){const bh=Number(BigInt(Bun.hash(s))&0xffffffffn),m=js===bh;if(!m)ok=false;console.log(`  ${m?c(E.g,'✓'):c(E.r,'✗')} "${s.substring(0,30)}${s.length>30?'...':''}"  Bun:${bh} JS:${js}`)}else console.log(`  ● "${s.substring(0,30)}${s.length>30?'...':''}"  wyhash:${js} fnv1a:${hFnv(s)}`)}
  console.log('');if(IS_BUN)console.log(c(ok?E.g+E.b:E.r+E.b,`  ${ok?t('t_ok'):t('t_fail')}\n`));else console.log(c(E.y,`  ${t('t_no_bun')}\n`))
}

// ── Interactive: DIY soul ────────────────────────────────
async function interactiveDiy(){
  const cfg=readCfg(),uid=cfg?.oauthAccount?.accountUuid?null:cfg?.userID
  if(!uid){console.log(c(E.y,`\n  ${t('diy_none')}\n`));return}
  console.log(c(E.b,`\n  ${t('diy_cur')}`));console.log(fmt(roll(uid),null,false))
  if(cfg?.companion?.name)console.log(c(E.d,`  Name: ${cfg.companion.name}`))
  const nm=await ask(`  ${c(E.m,'✏️')} ${t('diy_name')} `),ps=await ask(`  ${c(E.m,'✏️')} ${t('diy_pers')} `)
  if(!nm&&!ps){console.log(c(E.d,`\n  ${t('diy_auto')}\n`));return}
  if(writeSoul(nm||undefined,ps||undefined)){console.log(c(E.g+E.b,`\n  ${t('diy_done')}`));console.log(c(E.y,`  ${t('a_restart')}`))}
}

// ── Interactive mode ─────────────────────────────────────
async function interactiveMode(){
  banner()
  while(true){
    const items=[t('menu_search'),t('menu_check'),t('menu_diy'),t('menu_gallery'),t('menu_test'),t('menu_lang'),t('menu_exit')]
    const ch=await sel(t('menu_title'),items)
    switch(ch){
      case 0:do{await interactiveSearch()}while(await yn(t('si_again'),true));break
      case 1:interactiveCheck();await ask(`\n  ${c(E.d,t('press'))} `);break
      case 2:await interactiveDiy();await ask(`\n  ${c(E.d,t('press'))} `);break
      case 3:interactiveGallery();await ask(`  ${c(E.d,t('press'))} `);break
      case 4:interactiveSelftest();await ask(`  ${c(E.d,t('press'))} `);break
      case 5:L=await pickLang();banner();break
      case 6:default:console.log('');return
    }
  }
}

// ── CLI mode ─────────────────────────────────────────────
function parseArgs(argv){const args={cmd:null,f:{},o:{},minPoints:null,statReqs:null};const cmds=['search','check','apply','gallery','selftest','help','lang'];let i=0;for(;i<argv.length;i++){const a=argv[i];if(a==='--lang'||a==='--hash'){i++;continue}if(!a.startsWith('-')&&cmds.includes(a)){args.cmd=a;i++;break}}for(;i<argv.length;i++){const a=argv[i],n=argv[i+1];switch(a){case'--species':case'-s':args.f.species=n;i++;break;case'--rarity':case'-r':args.f.rarity=n;i++;break;case'--eye':case'-e':args.f.eye=n;i++;break;case'--hat':args.f.hat=n;i++;break;case'--shiny':args.f.shiny=true;break;case'--limit':case'-l':args.o.limit=parseInt(n);i++;break;case'--json':args.o.json=true;break;case'--min-points':if(!n||isNaN(parseInt(n))||parseInt(n)<0){console.log(c(E.r,`  ✗ min-points must be 0–500, got: ${n}\n`));i++;break}args.minPoints=parseInt(n);i++;break;case'--stat':if(!n||n.startsWith('-')||!argv[i+2]){console.log(c(E.r,'  --stat requires <name> <value>\n'));i++;break}if(!args.statReqs)args.statReqs=[];args.statReqs.push({name:n,value:argv[i+2]});i+=2;break;case'--parallel':args.o.parallel=true;break;case'--apply':args.o.apply=true;break;case'--unlimited':args.o.unlimited=true;break;case'--lang':case'--hash':i++;break;default:if(!a.startsWith('-')&&(args.cmd==='apply'||args.cmd==='check'))args.o.uid=a}}return args}

async function cliSearch(cr,opts,args){banner();const critResult=buildCriteriaFromArgs(args);if(critResult?.error){console.log(c(E.r,`  ✗ ${critResult.error}\n`));return}const mpResult=buildMinPointsFromArgs(args);if(mpResult?.error){console.log(c(E.r,`  ✗ ${mpResult.error}\n`));return}cr.statReqs=critResult?.statReqs||null;cr.minPoints=mpResult??null;const nonStatKeys=Object.keys(cr).filter(k=>!['statReqs','minPoints'].includes(k));if(!nonStatKeys.length&&!cr.statReqs&&cr.minPoints==null){console.log(c(E.r,'  Need at least one filter.\n'));return}const p=criteriaLabel(cr);console.log(c(E.b,`  ${t('s_target')} ${p}\n`));let res;const cliLimit=opts.unlimited?Infinity:(opts.limit||100_000_000);if(opts.parallel){res=await parallelSearch(cr,cliLimit,null)}else{res=search(cr,cliLimit,null,!!opts.unlimited)};if(!res.length){console.log(c(E.r,`\n  ${t('s_none')}\n`));return}const best=res[res.length-1];if(opts.json){console.log(JSON.stringify(res.map(r=>({userId:r.uid,buddy:r.buddy,attempts:r.attempts})),null,2));return}console.log(c(E.g+E.b,`\n  ════════════════════════════════════\n  ${t('s_best')}\n  ════════════════════════════════════`));console.log(fmt(best.buddy,best.uid));if(opts.apply){console.log(c(E.g,`  ⚡ Auto-apply...\n`));const{mode,cli,bin}=detectInstall();let nSalt=null,newSalt=null;if(mode==='native'&&bin){nSalt=detectSalt(bin);if(nSalt)newSalt=genSalt()};if(mode==='npm'&&cli){npmPatchAll(cli);writeConfig(best.uid,best.buddy,null)}else if(mode==='native'&&bin&&newSalt&&nSalt){nativePatchAll(bin,nSalt.salt,newSalt);writeConfig(best.uid,best.buddy,null)}else{writeConfig(best.uid,best.buddy,null)};console.log(c(E.g+E.b,`  ${t('si_done')}\n  ${t('a_restart')}\n`))}else{console.log(c(E.c,`  node buddy-reroll.mjs apply ${best.uid}\n`))}}

// ── Main ─────────────────────────────────────────────────
async function main(){
  let lang=loadLang();const args=parseArgs(process.argv.slice(2));const hasCmd=args.cmd||Object.keys(args.f).length>0
  if(lang===null)lang=await pickLang();L=lang;HASH_MODE=detectHash()
  if(!hasCmd){await interactiveMode();return}
  switch(args.cmd){
    case'search':await cliSearch(args.f,args.o,args);break
    case'check':banner();if(args.o.uid){console.log(c(E.b,`  ${t('chk_cur')}`));console.log(fmt(roll(args.o.uid),args.o.uid))}else interactiveCheck();break
    case'apply':banner();if(!args.o.uid){console.log(c(E.r,'  Usage: apply <userID>\n'));break};if(chkVer()!=='outdated'){writeConfig(args.o.uid,roll(args.o.uid));console.log(c(E.d,`  ${t('tip_override')}`))}break
    case'gallery':banner();interactiveGallery();break
    case'selftest':banner();interactiveSelftest();break
    case'lang':await pickLang();break
    default:if(Object.keys(args.f).length>0){await cliSearch(args.f,args.o,args)}else{banner();console.log(c(E.d,'  node buddy-reroll.mjs              → Interactive mode'));console.log(c(E.d,'  node buddy-reroll.mjs search ...   → CLI mode\n'));console.log(c(E.d,'  --species/-s  --rarity/-r  --eye/-e  --hat  --shiny  --limit/-l  --json  --lang <en|vi>  --hash <wyhash|fnv1a>\n'))}
  }
}
main()
