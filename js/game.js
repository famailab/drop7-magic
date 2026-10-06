/* ============ DROP 7 MAGIC — game engine ============ */
"use strict";
const ROWS = 7, COLS = 7, BALLS_PER_LEVEL = 5;
const LS = { settings: "d7m.settings", scores: "d7m.scores", save: "d7m.save", tut: "d7m.tutseen" };

/* ---------- state ---------- */
let G = null;
let discId = 1;
let tutSeenMem = false; // in-memory fallback when localStorage is unavailable (private mode)
const $ = (id) => document.getElementById(id);
const els = {};
["lcd","screen-title","screen-game","screen-over","screen-help","board","board-wrap","colhi",
 "preview-disc","aim","hud-balls","hud-score","hud-level","tutbar","tut-text","tut-next","tut-skip",
 "pauseveil","toast","title-top5","over-top5","over-score","over-time","over-level","newbest",
 "btn-continue","preview-zone"].forEach(id => els[id.replace(/-/g,"_")] = $(id));

function newState() {
  return {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    score: 0, level: 1, balls: BALLS_PER_LEVEL, next: null, cursor: 3,
    time: 0, timerId: null, busy: false, over: false, paused: false,
    tutorial: null, helpFrom: "title", _overflow: false, cycleOffset: 0,
  };
}
const cell = (v, cracks=0, hv=0) => {
  // v=0: blank (carries a hidden number hv); cracks: 0 pristine, 1 cracked
  if(v===0 && !hv) hv = 1 + ((Math.random()*7)|0);
  return { v, cracks, hv, id: discId++ };
};
/* magic balls: rare power-ups dealt as the next ball, consumed on drop */
const MAGIC = {
  shift: { name:"SHIFT", glyph:"±",  cls:"mg-shift" },
  peek:  { name:"PEEK",  glyph:"👀", cls:"mg-peek"  },
  cycle: { name:"CYCLE", glyph:"⟳", cls:"mg-cycle" },
  unify: { name:"UNIFY", glyph:"◉", cls:"mg-unify" },
};
const colDelta = (col) => col - 3; // shift magic: -3,-2,-1,0,+1,+2,+3

/* ---------- persistence ---------- */
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch(e){ return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  del(k) { try { localStorage.removeItem(k); } catch(e){} },
};

/* ---------- audio ---------- */
function applyMuteUI(){
  const m = Sfx.isMuted();
  $("ico-snd-on").classList.toggle("hidden", m);
  $("ico-snd-off").classList.toggle("hidden", !m);
  $("key-sound").classList.toggle("off", m);
}

/* ---------- screens ---------- */
function show(id){
  ["screen-title","screen-game","screen-over","screen-help","screen-settings"].forEach(s => $(s).classList.add("hidden"));
  $(id).classList.remove("hidden");
  // screens differ in height — refit so the calculator always fits the viewport
  if(typeof fit === "function") requestAnimationFrame(()=>fit());
}
function toast(msg, ms=1400){
  const t = els.toast;
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(t._h);
  t._h = setTimeout(()=>t.classList.add("hidden"), ms);
}


/* ---------- rendering ---------- */
function cellPx(){ return els.board.clientWidth / COLS; }

/* cycle magic: every cell rotates blank-pristine -> blank-cracked -> numbered -> blank-pristine.
   Numbered balls remember their value as hv when they become blanks. */
function cycleNext(s, off){
  const base = s.v>0 ? 2 : (s.cracks>=1?1:0);
  const st = (((base+off)%3)+3)%3;
  if(st===2){ if(s.v===0) s.v = s.hv||1; s.cracks = 0; }
  else { if(s.v>0) s.hv = s.v; s.v = 0; s.cracks = st; }
  return s;
}
const norm3 = (n)=>(((n%3)+3)%3);
/* display transform while a magic ball is active (preview only; board untouched) */
function dispOf(cellObj, r, c){
  let v = cellObj.v, cracks = cellObj.cracks, pv = false;
  const m = G.next && G.next.magic;
  if(m){
    if(m==="shift" && v>0){ v = Math.max(1, Math.min(7, v + colDelta(G.cursor))); pv = true; }
    else if(m==="peek" && v===0 && c===G.cursor){ v = cellObj.hv||1; pv = true; }
    else if(m==="cycle"){
      const off = norm3(G.cycleOffset);
      if(off!==0){
        const t = cycleNext({v:cellObj.v, cracks:cellObj.cracks, hv:cellObj.hv}, off);
        v = t.v; cracks = t.cracks; pv = true;
      }
    }
    else if(m==="unify" && v>0){ v = G.cursor+1; pv = true; }
  }
  return { v, cracks, pv };
}
function discEl(c, r, col){
  const d = document.createElement("div");
  const e = dispOf(c, r, col);
  d.className = "disc" + (e.v===0 ? " blank" : "") + (e.cracks>=1 ? " cracked" : "") + (e.pv ? " pv" : "");
  d.dataset.id = c.id;
  d.style.left = `calc(var(--cell) * ${col})`;
  d.style.top = `calc(var(--cell) * ${r})`;
  d.innerHTML = `<div class="face"><span>${e.v===0?"":e.v}</span></div>`;
  return d;
}
function renderBoard(){
  const b = els.board;
  b.innerHTML = "";
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const cellObj = G.board[r][c];
    if(cellObj){ cellObj._r=r; cellObj._c=c; b.appendChild(discEl(cellObj, r, c)); }
  }
  updateGhost();
}
function elAt(r,c){ return els.board.querySelector(`[data-id="${G.board[r][c]?.id}"]`); }

function renderPreview(){
  const p = els.preview_disc, n = G.next;
  const mg = n && n.magic;
  p.className = "disc" + (mg ? " magic "+MAGIC[mg].cls
    : (n && n.v===0 ? " blank" : "") + (n && n.cracks>=1 ? " cracked" : ""));
  p.style.cssText = "position:static;width:44px;height:44px;";
  p.querySelector(".face span").textContent = mg ? MAGIC[mg].glyph : (n && n.v>0 ? n.v : "");
  updateMagicHint();
}
/* magic hint label in the empty space above the grid */
function updateMagicHint(){
  const m = G && G.next && G.next.magic;
  const h = $("magic-hint");
  if(!m){ h.classList.add("hidden"); $("preview-zone").classList.remove("mg-on"); return; }
  h.classList.remove("hidden");
  $("preview-zone").classList.add("mg-on");
  $("magic-name").textContent = MAGIC[m].name + " MAGIC";
  const c = G.cursor;
  let desc = "";
  if(m==="shift"){ const d = colDelta(c); desc = "±" + (d>0?"+":"") + d + " ALL"; }
  else if(m==="peek") desc = "REVEAL COL " + (c+1);
  else if(m==="cycle"){ const o = ((G.cycleOffset%3)+3)%3; desc = ["●○○","○●○","○○●"][o]; }
  else if(m==="unify") desc = "→ " + (c+1);
  $("magic-desc").textContent = desc;
}
function setCursor(col, silent){
  col = Math.max(0, Math.min(COLS-1, col));
  if(G && G.next && G.next.magic==="cycle" && col!==G.cursor){
    G.cycleOffset = (((G.cycleOffset + (col - G.cursor)) % 3) + 3) % 3;
  }
  G.cursor = col;
  els.colhi.style.left = `calc(var(--cell) * ${G.cursor})`;
  els.aim.style.left = `calc(var(--cell) * ${G.cursor + 0.5})`;
  // magic previews follow the cursor; never rebuild mid-animation
  if(G.next && G.next.magic && !G.busy) renderBoard();
  else updateGhost();
  updateMagicHint();
  if(!silent) Sfx.move();
}
/* ghost preview: landing cell for normal balls, op chip for magic balls */
function updateGhost(){
  const gh = $("ghost");
  const m = G && G.next && G.next.magic;
  let show = G && !G.busy && !G.paused && !G.over && G.next &&
    !(G.tutorial && TUT[G.tutorial.step].type !== "drop");
  let row = -1, label = "", dashed = true;
  if(show && m){
    row = 0;
    const c = G.cursor;
    if(m==="shift"){ const d = colDelta(c); label = d===0 ? "±0" : (d>0?"+":"") + d; }
    else if(m==="peek") label = "👀";
    else if(m==="cycle") label = "⟳";
    else if(m==="unify") label = String(c+1);
  } else if(show){
    for(let r=ROWS-1;r>=0;r--) if(!G.board[r][G.cursor]){ row=r; break; }
    show = row >= 0;
    if(show){ const n = G.next; label = n.v===0 ? "" : String(n.v); dashed = n.v===0; }
  }
  if(!show){ gh.classList.add("hidden"); return; }
  gh.classList.remove("hidden");
  gh.style.left = `calc(var(--cell) * ${G.cursor})`;
  gh.style.top = `calc(var(--cell) * ${row})`;
  gh.querySelector(".face").style.borderStyle = dashed ? "dashed" : "solid";
  gh.querySelector("span").textContent = label;
}
function renderHUD(){
  els.hud_balls.textContent = G.balls;
  els.hud_score.textContent = G.score;
  els.hud_level.textContent = G.level;
}
function floater(r, c, text){
  const f = document.createElement("div");
  f.className = "float-score"; f.textContent = text;
  const px = cellPx();
  f.style.left = (c*px + px*0.18) + "px";
  f.style.top = (r*px) + "px";
  els.board.appendChild(f);
  f.animate([{ transform:"translateY(0)", opacity:1 }, { transform:"translateY(-34px)", opacity:0 }],
    { duration: 750, easing: "ease-out" }).onfinish = () => f.remove();
}
const wait = (ms) => new Promise(res => setTimeout(res, ms));

/* ---------- core rules ---------- */
function segLen(r, c, dr, dc){
  let n = 0, rr = r, cc = c;
  while(rr>=0 && rr<ROWS && cc>=0 && cc<COLS && G.board[rr][cc]){ n++; rr+=dr; cc+=dc; }
  return n;
}
function findPops(){
  const pops = [];
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const cellObj = G.board[r][c];
    if(!cellObj || cellObj.v===0) continue;
    const rowLen = segLen(r,c,0,-1) + segLen(r,c,0,1) - 1;
    const colLen = segLen(r,c,-1,0) + segLen(r,c,1,0) - 1;
    if(cellObj.v===rowLen || cellObj.v===colLen) pops.push([r,c]);
  }
  return pops;
}
function neighbors(r,c){
  const out=[];
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{
    const rr=r+dr, cc=c+dc;
    if(rr>=0&&rr<ROWS&&cc>=0&&cc<COLS&&G.board[rr][cc]) out.push([rr,cc]);
  });
  return out;
}
function snapshotTops(){
  const m = new Map(), px = cellPx();
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const cellObj = G.board[r][c];
    if(cellObj) m.set(cellObj.id, r*px);
  }
  return m;
}
function flipFrom(oldTops, filter){
  const px = cellPx();
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const cellObj = G.board[r][c];
    if(!cellObj || !oldTops.has(cellObj.id)) continue;
    const dy = oldTops.get(cellObj.id) - r*px;
    if(Math.abs(dy) < 1) continue;
    if(filter && !filter(cellObj, dy)) continue;
    const el = elAt(r,c);
    if(el) el.animate([{ transform:`translateY(${dy}px)` }, { transform:"translateY(0)" }],
      { duration: 200, easing: "cubic-bezier(.3,.7,.4,1)" });
  }
}
function applyGravity(){
  for(let c=0;c<COLS;c++){
    const stack=[];
    for(let r=ROWS-1;r>=0;r--) if(G.board[r][c]) stack.push(G.board[r][c]);
    for(let r=ROWS-1,i=0;r>=0;r--,i++) G.board[r][c] = i<stack.length ? stack[i] : null;
  }
}

/* chain multiplier lives in the solar panel, off the board */
function setChainBadge(n){
  const b = $("chain-badge");
  if(n>=2){
    $("chain-num").textContent = "x"+n;
    b.classList.remove("hidden");
    if(n>=7 && !b.classList.contains("mega")){
      b.classList.add("mega");
      Sfx.combo();
      fireworks();
      els.lcd.classList.remove("celebrate");
      void els.lcd.offsetWidth; // restart the flash animation
      els.lcd.classList.add("celebrate");
    }
  }
  else { b.classList.add("hidden"); b.classList.remove("mega"); }
}
/* chain x7 celebration: translucent full-LCD fireworks, board stays visible */
function fireworks(){
  const cv = $("fx"), lcd = els.lcd;
  const lr = lcd.getBoundingClientRect(); // displayed px (correct under transform scale)
  const W = cv.width = Math.round(lr.width), H = cv.height = Math.round(lr.height);
  if(!W || !H) return;
  cv.classList.remove("hidden");
  const ctx = cv.getContext("2d");
  const colors = ["#ffd76a","#ff6b6b","#5eead4","#f0abfc","#a7f3d0","#ffffff","#fdba74"];
  let parts = [];
  for(let b=0;b<5;b++){
    setTimeout(()=>{
      const x = W*(0.12+Math.random()*0.76), y = H*(0.10+Math.random()*0.45);
      for(let i=0;i<42;i++){
        const a = Math.random()*Math.PI*2, sp = 1.2+Math.random()*3.4;
        parts.push({ x, y,
          vx: Math.cos(a)*sp, vy: Math.sin(a)*sp-1.2,
          life: 1, decay: 0.007+Math.random()*0.010,
          c: colors[(Math.random()*colors.length)|0],
          r: 1.6+Math.random()*2.2 });
      }
    }, b*320);
  }
  const start = performance.now();
  (function tick(now){
    const t = (now||performance.now()) - start;
    // fade existing pixels toward transparent: trails without darkening the LCD
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = "source-over";
    parts = parts.filter(p=>p.life>0);
    for(const p of parts){
      p.x += p.vx; p.y += p.vy; p.vy += 0.045; p.vx *= 0.985; p.life -= p.decay;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if(t < 3300) requestAnimationFrame(tick);
    else { cv.classList.add("hidden"); ctx.clearRect(0,0,W,H); }
  })();
}
/* full board clear: fireworks + combo jingle + toast + LCD flash.
   If the chain-x7 mega celebration already fired this resolution, skip the
   duplicate jingle/fireworks and just add the toast (re-flash the LCD). */
function celebrateClear(megaAlready){
  if(!megaAlready){ Sfx.combo(); fireworks(); }
  els.lcd.classList.remove("celebrate");
  void els.lcd.offsetWidth; // restart the flash animation
  els.lcd.classList.add("celebrate");
  toast("BOARD CLEAR!", 1600);
}
/* combo bonus feedback: bump the BALLS counter and float a +n tag */
function bonusBallFx(n){
  renderHUD();
  const seg = $("hud-balls");
  seg.classList.remove("bump"); void seg.offsetWidth; seg.classList.add("bump");
  const tag = document.createElement("span");
  tag.className = "ball-bonus"; tag.textContent = "+" + n;
  seg.parentElement.appendChild(tag);
  setTimeout(()=>tag.remove(), 950);
  Sfx.bonus();
}
async function resolveBoard(){
  let chain = 0;
  for(;;){
    const pops = findPops();
    if(!pops.length) break;
    chain++;
    // combo bonus: the first pop of a turn earns nothing; every chain wave
    // from x2 onward grants +1 disc (real games only).
    // A magic drop zeroes balls, but a big combo can earn the level back!
    if(!G.tutorial && chain>1){
      G.balls += 1;
      bonusBallFx(1);
    }
    const popSet = new Set(pops.map(([r,c])=>r*COLS+c));
    // blanks adjacent to an explosion: one stage per wave (dedupe)
    const hitBlanks = new Map();
    pops.forEach(([r,c]) => neighbors(r,c).forEach(([rr,cc])=>{
      const n = G.board[rr][cc], key = rr*COLS+cc;
      if(n && n.v===0 && !popSet.has(key) && !hitBlanks.has(key)) hitBlanks.set(key,[rr,cc]);
    }));
    const crackNow = [], revealNow = [];
    hitBlanks.forEach(([r,c])=>{
      (G.board[r][c].cracks>=1 ? revealNow : crackNow).push([r,c]);
    });
    // animate pops
    Sfx.pop(chain);
    const gained = pops.length * 7 * chain;
    G.score += gained;
    pops.forEach(([r,c])=>{
      const el = elAt(r,c);
      if(el) el.animate(
        [{ transform:"scale(1)", opacity:1 }, { transform:"scale(1.35)", opacity:1, offset:.45 }, { transform:"scale(.2)", opacity:0 }],
        { duration: 240, easing:"ease-in" });
      floater(r, c, "+" + 7*chain);
    });
    crackNow.forEach(([r,c])=>{
      const el = elAt(r,c);
      if(el) el.animate(
        [{ transform:"translateX(0)" }, { transform:"translateX(-4px)" }, { transform:"translateX(4px)" }, { transform:"translateX(0)" }],
        { duration: 200 });
    });
    revealNow.forEach(([r,c])=>{
      const el = elAt(r,c);
      if(el) el.animate(
        [{ transform:"scale(1)", filter:"brightness(1)" },
         { transform:"scale(1.28)", filter:"brightness(2)", offset:.5 },
         { transform:"scale(1)", filter:"brightness(1)" }],
        { duration: 280 });
    });
    if(chain>1) setChainBadge(chain);
    renderHUD();
    await wait(280);
    // apply removals / cracks / reveals
    pops.forEach(([r,c])=>{ G.board[r][c]=null; });
    crackNow.forEach(([r,c])=>{ G.board[r][c].cracks=1; });
    if(crackNow.length) Sfx.crack();
    revealNow.forEach(([r,c])=>{
      const n = G.board[r][c];
      n.v = n.hv||1; n.cracks = 0; // a blank reveals its own hidden number
    });
    if(revealNow.length) Sfx.reveal();
    const old = snapshotTops();
    applyGravity();
    renderBoard();
    flipFrom(old);
    revealNow.forEach(([r,c])=>{
      const el = elAt(r,c);
      if(el) el.animate(
        [{ transform:"scale(.3)", opacity:.4 }, { transform:"scale(1.15)", opacity:1, offset:.6 }, { transform:"scale(1)" }],
        { duration: 220 });
    });
    await wait(240);
  }
  const megaFired = $("chain-badge").classList.contains("mega");
  const cleared = chain>0 && G.board.every(row => row.every(x => !x));
  setChainBadge(0);
  if(cleared) celebrateClear(megaFired);
}

/* smart magic spawning: the fuller the board, the more often magic appears
   (a lifeline when you're cornered); an empty board never gets magic.
   PEEK is only offered when blanks exist — nothing to reveal otherwise. */
function boardStats(){
  let n = 0, blanks = 0;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const o = G.board[r][c];
    if(o){ n++; if(o.v===0) blanks++; }
  }
  return { n, blanks };
}
function magicRate(n){
  if(n===0) return 0;            // empty board: no magic at all
  const t = Math.min(1, n/42);   // 42+ discs ≈ desperate
  return 0.03 + 0.27*t*t;        // ~3% sparse, ~10% mid-game, 30% near-full
}
function rollNext(level){
  const { n, blanks } = boardStats();
  if(Math.random() < magicRate(n)){
    const types = ["shift","cycle","unify"];
    if(blanks>0) types.push("peek");
    return { magic: types[(Math.random()*types.length)|0], id: discId++ };
  }
  return rollDisc(level);
}
/* dealing the next ball also fires the magic spawn cue */
function dealNext(d){
  G.next = d;
  if(d.magic){ G.cycleOffset = 0; Sfx.magic(); }
  renderPreview();
}
function rollDisc(level){
  if(Math.random() < 0.07) return cell(0);
  const target = Math.min(6, 1.2 + level*0.55);
  let sum=0; const ws=[];
  for(let i=1;i<=7;i++){ const w=Math.max(0.03, 0.22-Math.abs(i-target)*0.055); ws.push(w); sum+=w; }
  let x=Math.random()*sum;
  for(let i=0;i<7;i++){ x-=ws[i]; if(x<=0) return cell(i+1); }
  return cell(7);
}

async function dropDisc(col){
  if(!G || G.busy || G.paused || G.over) return;
  if(G.tutorial && !tutAllow(col)) return;
  if(G.next && G.next.magic){ await dropMagicBall(col); return; }
  // find landing row
  let row=-1;
  for(let r=ROWS-1;r>=0;r--) if(!G.board[r][col]){ row=r; break; }
  if(row<0){ // column full
    Sfx.deny();
    els.board.animate(
      [{ transform:"translateX(0)" }, { transform:"translateX(-6px)" }, { transform:"translateX(6px)" }, { transform:"translateX(0)" }],
      { duration: 180 });
    toast("COLUMN FULL", 900);
    return;
  }
  G.busy = true;
  try {
    const d = G.next;
    G.board[row][col] = d;
    if(!G.tutorial) G.balls--;
    Sfx.drop();
    renderBoard(); renderHUD();
    // fall animation
    const el = elAt(row,col), px = cellPx();
    if(el) await el.animate(
      [{ transform:`translateY(${-(row*px+70)}px)` }, { transform:"translateY(0)" }],
      { duration: 90+row*28, easing:"cubic-bezier(.4,.6,.6,1)" }).finished.catch(()=>{});
    renderBoard();
    await endTurn();
  } finally {
    G.busy = false;
    updateGhost();
  }
}

/* shared post-drop flow: resolve pops/chains, level up, deal next ball */
async function endTurn(){
  await resolveBoard();
  if(checkTopOut()){ gameOver(); return; }
  if(!G.tutorial){
    if(G.balls<=0) await levelUp();
    else dealNext(rollNext(G.level));
    // stuck: board completely full and the next disc needs an empty cell.
    // (A magic ball can still be dropped on a full board, so it doesn't count.)
    if(!G.over && G.board.every(row => row.every(x => x)) && !(G.next && G.next.magic)){
      gameOver(); return;
    }
    renderBoard(); renderHUD(); saveGame(); // renderBoard clears stale magic previews
  } else {
    tutAfterDrop();
  }
}

/* magic balls are consumed on drop: apply the spell, then resolve like a turn.
   The ball is consumed BEFORE rendering so committed numbers show permanently
   (no flicker back through the preview state). Dropping magic always ends the
   level: balls are zeroed, forcing a level-up for extra strategy. */
async function dropMagicBall(col){
  G.busy = true;
  try{
    const m = G.next.magic;
    G.next = null;
    renderPreview();
    await applyMagic(col, m);
    if(!G.tutorial) G.balls = 0;
    renderBoard(); renderHUD();
    await endTurn();
  } finally {
    G.busy = false;
    updateGhost();
  }
}

async function applyMagic(col, m){
  const changed = [];
  const mark = (r,c)=>changed.push([r,c]);
  if(m==="shift"){
    const d = colDelta(col);
    Sfx.shiftSfx(d);
    if(d!==0) for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const cellObj = G.board[r][c];
      if(cellObj && cellObj.v>0){
        const nv = Math.max(1, Math.min(7, cellObj.v+d));
        if(nv!==cellObj.v){ cellObj.v = nv; mark(r,c); }
      }
    }
  } else if(m==="peek"){
    Sfx.peekSfx();
    for(let r=0;r<ROWS;r++){
      const cellObj = G.board[r][col];
      if(cellObj && cellObj.v===0){ cellObj.v = cellObj.hv||1; cellObj.cracks = 0; mark(r,col); }
    }
  } else if(m==="cycle"){
    Sfx.cycleSfx();
    const off = norm3(G.cycleOffset);
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const cellObj = G.board[r][c];
      if(cellObj){
        const before = cellObj.v + "/" + cellObj.cracks;
        cycleNext(cellObj, off);
        if(cellObj.v + "/" + cellObj.cracks !== before) mark(r,c);
      }
    }
  } else if(m==="unify"){
    Sfx.unifySfx();
    const n = col+1;
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const cellObj = G.board[r][c];
      if(cellObj && cellObj.v>0 && cellObj.v!==n){ cellObj.v = n; mark(r,c); }
    }
  }
  renderBoard();
  changed.forEach(([r,c])=>{
    const el = elAt(r,c);
    if(el) el.animate(
      [{ transform:"scale(1)" }, { transform:"scale(1.22)", offset:.5 }, { transform:"scale(1)" }],
      { duration: 240 });
  });
  if(changed.length) await wait(260);
}

function checkTopOut(){
  // called after a rise; a disc above row 0 is represented by shift overflow
  return G._overflow === true;
}

async function levelUp(){
  G.level++;
  toast("LEVEL " + G.level, 1200);
  Sfx.levelup();
  await wait(500);
  const old = snapshotTops();
  // detect overflow: anything in row 0 gets pushed out
  for(let c=0;c<COLS;c++) if(G.board[0][c]) G._overflow = true;
  for(let c=0;c<COLS;c++){
    for(let r=0;r<ROWS-1;r++) G.board[r][c] = G.board[r+1][c];
    G.board[ROWS-1][c] = cell(0); // pristine blank row rises from below
  }
  G.balls = BALLS_PER_LEVEL;
  renderBoard();
  flipFrom(old);
  // fade in the new bottom row
  for(let c=0;c<COLS;c++){
    const el = elAt(ROWS-1,c);
    if(el) el.animate([{ opacity:0, transform:"scale(.4)" }, { opacity:1, transform:"scale(1)" }], { duration:260 });
  }
  await wait(300);
  if(G._overflow){ gameOver(); return; }
  await resolveBoard(); // the rise can complete matches
  if(G._overflow){ gameOver(); return; }
  dealNext(rollNext(G.level));
  renderHUD(); saveGame();
}

/* ---------- game flow ---------- */
function startTimer(){
  stopTimer();
  G.timerId = setInterval(()=>{
    if(G && !G.paused && !G.over) G.time++;
  }, 1000);
}
function stopTimer(){ if(G && G.timerId){ clearInterval(G.timerId); G.timerId=null; } }

/* opening board: bottom 3 rows pre-filled, guaranteed no instant pops */
function rollNum(level){
  for(let i=0;i<10;i++){
    const d = rollDisc(level);
    if(d.v>0) return d.v;
  }
  return 1;
}
function genStartBoard(){
  // Opening board: each column gets 0-3 balls with random states
  // (numbered / pristine blank / cracked blank), stacked from the bottom
  // so nothing floats. Instant pops are repaired by swapping the popping
  // disc's value for one that can't pop there — occupancy never changes,
  // so segment lengths are untouched and one pass is provably enough.
  // The board is guaranteed non-empty.
  let placed = 0;
  for(let c=0;c<COLS;c++){
    const n = (Math.random()*4)|0; // 0..3 balls in this column
    for(let i=0;i<n;i++){
      const r = ROWS-1-i, q = Math.random();
      let d;
      if(q<0.12) d = cell(0);        // pristine blank
      else if(q<0.22) d = cell(0,1); // cracked blank (random hidden number)
      else d = cell(1+((Math.random()*7)|0)); // numbered 1-7
      G.board[r][c] = d; placed++;
    }
  }
  if(placed===0) G.board[ROWS-1][3] = cell(1+((Math.random()*7)|0));
  for(let pass=0; pass<5; pass++){
    const pops = findPops();
    if(!pops.length) break;
    pops.forEach(([r,c])=>{
      const rl = segLen(r,c,0,-1)+segLen(r,c,0,1)-1;
      const cl = segLen(r,c,-1,0)+segLen(r,c,1,0)-1;
      let v; do { v = 1+((Math.random()*7)|0); } while(v===rl || v===cl);
      G.board[r][c] = cell(v);
    });
  }
}

function newGame(){
  stopTimer();
  setChainBadge(0);
  G = newState();
  genStartBoard();
  dealNext(rollNext(1));
  show("screen-game");
  renderBoard(); renderPreview(); renderHUD();
  setCursor(3, true);
  startTimer();
  saveGame();
  if(!tutSeenMem && !store.get(LS.tut, false)) startTutorial();
}
function continueGame(){
  const s = store.get(LS.save, null);
  if(!s){ newGame(); return; }
  stopTimer();
  G = newState();
  G.board = s.b.map(row => row.map(x => x ? cell(x.v, x.k|0, x.h|0) : null));
  G.score=s.s; G.level=s.l; G.balls=s.bl; G.time=s.t||0;
  G.next = s.n.mg ? { magic: s.n.mg, id: discId++ } : cell(s.n.v, s.n.k|0, s.n.h|0);
  show("screen-game");
  renderBoard(); renderPreview(); renderHUD();
  setCursor(s.cu ?? 3, true);
  startTimer();
}
function saveGame(){
  if(!G || G.over || G.tutorial) return;
  store.set(LS.save, {
    b: G.board.map(row => row.map(c => c ? { v:c.v, k:c.cracks|0, h:c.hv|0 } : 0)),
    s: G.score, l: G.level, bl: G.balls, t: G.time, cu: G.cursor,
    n: G.next.magic ? { mg: G.next.magic } : { v: G.next.v, k: G.next.cracks|0, h: G.next.hv|0 },
  });
}
function quitToMenu(){
  if(G && !G.over && !G.tutorial) saveGame();
  stopTimer();
  G = null;
  els.pauseveil.classList.add("hidden");
  refreshTitle();
  show("screen-title");
}

function gameOver(){
  G.over = true;
  stopTimer();
  Sfx.gameover();
  store.del(LS.save);
  const scores = store.get(LS.scores, []);
  const entry = { s: G.score, l: G.level, d: new Date().toLocaleDateString() };
  const isBest = scores.length===0 || G.score > scores[0].s;
  scores.push(entry);
  scores.sort((a,b)=>b.s-a.s);
  store.set(LS.scores, scores.slice(0,5));
  $("over-score").textContent = G.score;
  $("over-time").textContent = fmtTime(G.time);
  $("over-level").textContent = G.level;
  els.newbest.classList.toggle("hidden", !(isBest && G.score>0));
  if(isBest && G.score>0) Sfx.fanfare();
  renderTop5($("over-top5"), G.score);
  setTimeout(()=>{ show("screen-over"); }, 650);
  toast("GAME OVER", 1200);
}
const fmtTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

function renderTop5(ol, highlight){
  const scores = store.get(LS.scores, []);
  ol.innerHTML = "";
  if(!scores.length){ ol.innerHTML = "<li>— no scores yet —</li>"; return; }
  scores.forEach((e,i)=>{
    const li = document.createElement("li");
    li.textContent = `${e.s} pts · Lv${e.l}`;
    if(highlight!=null && e.s===highlight && !li.className) li.classList.add("me");
    ol.appendChild(li);
  });
}
function refreshTitle(){
  const has = !!store.get(LS.save, null);
  els.btn_continue.classList.toggle("hidden", !has);
  renderTop5($("title-top5"));
}

/* ---------- pause ---------- */
function setPaused(p){
  if(!G || G.over) return;
  G.paused = p;
  els.pauseveil.classList.toggle("hidden", !p);
  Sfx.click();
}

/* ================================================================
   TUTORIAL — scripted interactive onboarding
================================================================ */
const TUT = [
  { type:"info",
    text:"Welcome to <b>DROP 7 MAGIC</b>! I'm CAL, your calculator coach.<br><br>Your goal: keep discs from piling above the top. A disc <b>POPS</b> when its number equals the number of discs in its row <b>or</b> column.<br><br>Let's try it — I'll set up the board for you." },
  { type:"drop", target:3, next:()=>cell(3),
    setup(){ put(6,1,3); put(6,2,3); },
    text:"See the two <b>3s</b>? Drop your <b>3</b> into the column under the <b>↓ arrow</b> to make three in a row — all three will pop!",
    done:"<b>+21!</b> 7 points per disc. Easy." },
  { type:"drop", target:4, next:()=>cell(2),
    setup(){ put(6,4,2); },
    text:"<b>Columns</b> count too. Drop the <b>2</b> under the <b>↓ arrow</b> — the column will hold exactly 2 discs.",
    done:"<b>+14!</b> Rows, columns — both work." },
  { type:"drop", target:2, next:()=>cell(3),
    setup(){ put(6,0,3); put(6,1,3); G.board[5][1] = cell(0, 1, 1); /* cracked blank stacked on the 3, hides a 1 */ },
    text:"Now a <b>CHAIN</b>. Drop the <b>3</b> under the <b>↓ arrow</b>: the 3s pop first, the cracked blank <b>reveals a 1</b> — and a lone 1 pops all by itself! Every wave <b>multiplies</b> your score!",
    done:"<b>+35!</b> Chain ×1 then ×2. That's the magic." },
  { type:"info",
    text:"<b>Gray discs</b> are <b>BLANKS</b> — they have no number.<br><br>When a disc pops next to a blank, it <b>CRACKS</b> (amber dashed ring). A second neighboring pop <b>REVEALS a hidden number</b> — it becomes a normal disc that can pop and chain!<br><br>Watch for them; they're your best friends for big chains." },
  { type:"info",
    text:"<b>MAGIC BALLS!</b> Sometimes a <b>glowing ball</b> appears — each has a power and is consumed on drop:<br>± <b>SHIFT</b>: adds to every number (−3…+3, set by column)<br>👀 <b>PEEK</b>: reveals a column's hidden numbers<br>⟳ <b>CYCLE</b>: sliding ←/→ cycles <i>every</i> ball: blank → cracked → numbered → blank<br>◉ <b>UNIFY</b>: makes every number the same<br><br>Dropping magic also <b>ends the level</b> — time it well!<br><br>Let's try <b>SHIFT</b>!" },
  { type:"drop", target:4, next:()=>({ magic:"shift", id:discId++ }),
    setup(){ put(6,0,2); put(6,1,2); put(6,2,2); },
    text:"Slide to the <b>5th column (+1)</b> — follow the <b>↓ arrow</b> — and drop the <b>± ball</b> — every 2 becomes a 3, and three 3s pop! Watch the gold preview.",
    done:"<b>+21!</b> The magic ball is consumed. Try the other three in real games!" },
  { type:"info", final:true,
    text:"You get <b>5 discs per LEVEL</b>. When they run out, the whole board <b>rises</b> and a cracked row slides in at the bottom.<br><br><b>Combos earn bonus discs</b> — a lone pop earns nothing, but every chain wave from <b>×2</b> on grants <b>+1 disc</b>, so big chains keep you playing!<br><br>If any disc is pushed <b>above the top</b> — <b>GAME OVER</b>.<br><br>You're ready. Good luck, and have fun!" },
];

function put(r,c,v){ G.board[r][c]=cell(v); }

function startTutorial(){
  G.tutorial = { step: 0 };
  els.tutbar.classList.remove("hidden");
  tutShowStep(0);
}
/* tutorial target arrow: parked above the target column on drop steps,
   hidden everywhere else (clearly distinct from the ▼ that follows the cursor) */
function positionTutArrow(){
  const a = $("tut-arrow");
  if(!G || !G.tutorial || TUT[G.tutorial.step].type!=="drop"){ a.classList.add("hidden"); return; }
  const px = cellPx();
  a.style.left = (TUT[G.tutorial.step].target*px + px/2) + "px";
  a.classList.remove("hidden");
}
function tutShowStep(i){
  const st = TUT[i];
  G.tutorial.step = i;
  // clear board for drop steps
  G.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  if(st.setup) st.setup();
  dealNext(st.next ? st.next() : cell(1));
  renderBoard();
  if(st.type==="drop") setCursor(st.target, true);
  els.colhi.classList.toggle("hot", st.type==="drop");
  positionTutArrow();
  els.tut_text.innerHTML = st.text;
  els.tut_next.classList.toggle("hidden", st.type!=="info");
  els.tut_next.textContent = st.final ? "START PLAYING →" : "NEXT →";
  els.tut_skip.classList.toggle("hidden", !!st.final);
  els.tutbar.classList.remove("collapsed");
  els.tutbar.classList.toggle("mode-info", st.type==="info");
  els.tutbar.classList.toggle("mode-drop", st.type!=="info");
}
function tutAllow(col){
  const st = TUT[G.tutorial.step];
  if(st.type!=="drop") return false;
  if(col !== st.target){
    Sfx.deny();
    toast("DROP UNDER THE ARROW", 1100);
    return false;
  }
  return true;
}
async function tutAfterDrop(){
  const st = TUT[G.tutorial.step];
  await wait(700);
  if(st.done) toast(st.done.replace(/<[^>]+>/g,""), 1500);
  await wait(900);
  tutShowStep(G.tutorial.step + 1);
}
function tutNext(){
  const st = TUT[G.tutorial.step];
  Sfx.click();
  if(st.final){ endTutorial(); newGame(); return; }
  tutShowStep(G.tutorial.step + 1);
}
function endTutorial(){
  if(!G) return;
  G.tutorial = null;
  els.colhi.classList.remove("hot");
  $("tut-arrow").classList.add("hidden");
  els.tutbar.classList.add("hidden");
  tutSeenMem = true;
  store.set(LS.tut, true);
}

/* ================================================================
   INPUT — drag, tap/click, keyboard
================================================================ */
function colFromEvent(e){
  const r = els.board_wrap.getBoundingClientRect();
  const x = (e.clientX - r.left);
  return Math.max(0, Math.min(COLS-1, Math.floor(x / (r.width / COLS))));
}
let dragging = false, downCol = -1;

function bindInput(){
  const wrap = els.board_wrap;
  wrap.addEventListener("pointerdown", (e)=>{
    Sfx.unlock();
    if(!G || G.busy || G.paused || G.over) return;
    dragging = true; downCol = colFromEvent(e);
    setCursor(downCol);
    wrap.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  wrap.addEventListener("pointermove", (e)=>{
    if(!G || G.paused || G.over) return;
    const c = colFromEvent(e);
    if(dragging){ if(c!==G.cursor) setCursor(c); }
    else if(e.pointerType==="mouse" && c!==G.cursor && !G.busy) setCursor(c, true);
  });
  const up = (e)=>{
    if(!dragging) return;
    dragging = false;
    if(!G || G.busy || G.paused || G.over) return;
    const r = els.board_wrap.getBoundingClientRect();
    const inside = e.clientX>=r.left-20 && e.clientX<=r.right+20 && e.clientY>=r.top-70 && e.clientY<=r.bottom+20;
    if(inside) dropDisc(colFromEvent(e));
  };
  wrap.addEventListener("pointerup", up);
  wrap.addEventListener("pointercancel", ()=>{ dragging=false; });

  window.addEventListener("keydown", (e)=>{
    Sfx.unlock();
    if(!G){
      if(e.key==="Enter"){ Sfx.click(); const has=store.get(LS.save,null); has?continueGame():newGame(); }
      return;
    }
    if(G.over) { if(e.key==="Enter"){ Sfx.click(); newGame(); } return; }
    const k = e.key;
    if(k==="p"||k==="P"||k==="Escape"){
      if(!$("screen-game").classList.contains("hidden") && !G.tutorial) setPaused(!G.paused);
      return;
    }
    if(k==="m"||k==="M"){ toggleMute(); return; }
    if(k==="h"||k==="H"){ Sfx.click(); openHelp(G?"game":"title"); return; }
    if(G.paused || G.busy) return;
    if(k==="ArrowLeft"||k==="a"||k==="A") setCursor(G.cursor-1);
    else if(k==="ArrowRight"||k==="d"||k==="D") setCursor(G.cursor+1);
    else if(k===" "||k==="Enter"||k==="ArrowDown"||k==="s"||k==="S"){ e.preventDefault(); dropDisc(G.cursor); }
  });

  document.addEventListener("visibilitychange", ()=>{
    if(document.hidden && G && !G.over && !$("screen-game").classList.contains("hidden") && !G.tutorial) setPaused(true);
  });

  // physical buttons
  $("key-home").onclick = ()=>{ Sfx.click(); if(G && !G.over && !G.tutorial) saveGame(); quitToMenu(); };
  $("key-pause").onclick = ()=>{ if(G && !$("screen-game").classList.contains("hidden")) setPaused(!G.paused); };
  $("key-sound").onclick = ()=>toggleMute();
  $("key-help").onclick = ()=>{ Sfx.click(); openHelp(G?"game":"title"); };

  // title / menu buttons
  $("btn-new").onclick = ()=>{ Sfx.click(); newGame(); };
  $("btn-continue").onclick = ()=>{ Sfx.click(); continueGame(); };
  $("btn-tutorial").onclick = ()=>{ Sfx.click(); G=newState(); G.next=cell(1); show("screen-game"); renderBoard(); renderPreview(); renderHUD(); setCursor(3,true); startTutorial(); };
  $("btn-how").onclick = ()=>{ Sfx.click(); openHelp("title"); };
  $("btn-help-back").onclick = ()=>{ Sfx.click(); closeHelp(); };
  $("help-prev").onclick = ()=>{ if(helpPage>0){ Sfx.click(); helpPage--; renderHelpPage(); } };
  $("help-next").onclick = ()=>{ const n=document.querySelectorAll(".help-page").length; if(helpPage<n-1){ Sfx.click(); helpPage++; renderHelpPage(); } };
  $("btn-again").onclick = ()=>{ Sfx.click(); newGame(); };
  $("btn-menu2").onclick = ()=>{ Sfx.click(); quitToMenu(); };

  // pause menu
  $("btn-resume").onclick = ()=>setPaused(false);
  $("btn-restart").onclick = ()=>{ Sfx.click(); els.pauseveil.classList.add("hidden"); newGame(); };
  $("btn-help2").onclick = ()=>{ Sfx.click(); openHelp("pause"); };
  $("btn-quit").onclick = ()=>{ Sfx.click(); quitToMenu(); };

  // tutorial bar
  $("tut-next").onclick = ()=>tutNext();
  $("tut-skip").onclick = ()=>{ Sfx.click(); endTutorial(); newGame(); };
  $("tut-hide").onclick = (e)=>{ e.stopPropagation(); Sfx.click(); els.tutbar.classList.add("collapsed"); };
  els.tutbar.addEventListener("click", ()=>{
    if(els.tutbar.classList.contains("collapsed")){ Sfx.click(); els.tutbar.classList.remove("collapsed"); }
  });

  // first gesture unlocks audio
  window.addEventListener("pointerdown", ()=>Sfx.unlock(), { once:true });
  // hard touch lock: the page must never move under fingers (backup for the
  // CSS touch-action/overscroll lock above) — prevents misdrops on touch
  document.addEventListener("touchmove", e=>e.preventDefault(), {passive:false});
  document.addEventListener("gesturestart", e=>e.preventDefault()); // iOS pinch zoom
  document.addEventListener("dblclick", e=>e.preventDefault());     // double-tap zoom
}
function toggleMute(){
  Sfx.setMuted(!Sfx.isMuted());
  const s = store.get(LS.settings, {});
  s.muted = Sfx.isMuted(); // merge — never wipe theme/wallpaper/brand
  store.set(LS.settings, s);
  applyMuteUI();
  if(!Sfx.isMuted()) Sfx.click();
}
function openHelp(from){
  if(G) G.helpFrom = from;
  if(from==="game" && G && !G.tutorial && !G.over){
    G._helpResume = !G.paused; // resume after help only if we weren't already paused
    G.paused = true;
  }
  els.pauseveil.classList.add("hidden");
  show("screen-help");
  fitHelpPages(); // measure after show (same frame, no paint between)
  helpPage = 0; renderHelpPage();
}
/* help pagination: keep the LCD a fixed size, flip pages instead of stretching.
   Page heights vary by font/device, so measure the tallest page at runtime
   and pin every page to it — all pages always render identically tall. */
let helpPage = 0;
function fitHelpPages(){
  const pages = [...document.querySelectorAll(".help-page")];
  if(!pages.length) return;
  const wasHidden = pages.filter(p=>p.classList.contains("hidden"));
  wasHidden.forEach(p=>p.classList.remove("hidden"));
  const h = Math.max(...pages.map(p=>p.offsetHeight));
  pages.forEach(p=>{ p.style.minHeight = h + "px"; });
  wasHidden.forEach(p=>p.classList.add("hidden"));
}
function renderHelpPage(){
  const pages = document.querySelectorAll(".help-page");
  pages.forEach(p=>p.classList.toggle("hidden", +p.dataset.p!==helpPage));
  $("help-dots").textContent = "○".repeat(helpPage) + "●" + "○".repeat(pages.length-helpPage-1);
  $("help-prev").disabled = helpPage===0;
  $("help-next").disabled = helpPage===pages.length-1;
}
function closeHelp(){
  const from = G ? G.helpFrom : "title";
  Sfx.click();
  if(from==="game"){
    show("screen-game");
    if(G && !G.over){
      if(G._helpResume){ G.paused = false; els.pauseveil.classList.add("hidden"); }
      else setPaused(true);
    }
  }
  else if(from==="pause"){ show("screen-game"); if(G && !G.over) setPaused(true); }
  else show("screen-title");
}

/* ================= SETTINGS: theme / wallpaper / brand ================= */
const THEMES = [
  { id:"classic", name:"CLASSIC", sw:["#7e848c","#d3ead9"] },
  { id:"ocean",   name:"OCEAN",   sw:["#446084","#d2e9ec"] },
  { id:"sunset",  name:"SUNSET",  sw:["#93703f","#f4e8cb"] },
  { id:"gameboy", name:"GAMEBOY", sw:["#8c8c7e","#a8bd6e"] },
  { id:"sakura",  name:"SAKURA",  sw:["#b28a98","#f6e2e9"] },
];
/* wallpaper presets — brightness rule: the LCD base color is always the
   DARKEST tone; patterns only ever brighten (white/light elements). */
const WALLPAPERS = [
  { id:"none", name:"CLEAR", css:"" },                                     // pure solid LCD color
  { id:"dots", name:"DOTS", css:                                           // white dot grid, fading downward
    "background-image:radial-gradient(circle, rgba(255,255,255,.8) 2px, transparent 2.1px);" +
    "background-size:18px 18px;" +
    "-webkit-mask-image:linear-gradient(180deg,#000 15%,transparent 90%);" +
    "mask-image:linear-gradient(180deg,#000 15%,transparent 90%);" },
  { id:"grid", name:"GRID", css:                                           // chessboard
    "background-image:" +
    "linear-gradient(45deg, rgba(255,255,255,.38) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.38) 75%)," +
    "linear-gradient(45deg, rgba(255,255,255,.38) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.38) 75%);" +
    "background-size:28px 28px;background-position:0 0,14px 14px;" },
  { id:"waves", name:"WAVES", css:                                        // banknote guilloche, dense
    'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'72\' height=\'36\'%3E%3Cg fill=\'none\' stroke=\'rgba(255,255,255,0.45)\' stroke-width=\'1\'%3E%3Cpath d=\'M0 4 Q9 0 18 4 T36 4 T54 4 T72 4\'/%3E%3Cpath d=\'M0 9 Q9 5 18 9 T36 9 T54 9 T72 9\'/%3E%3Cpath d=\'M0 14 Q9 10 18 14 T36 14 T54 14 T72 14\'/%3E%3Cpath d=\'M0 19 Q9 15 18 19 T36 19 T54 19 T72 19\'/%3E%3Cpath d=\'M0 24 Q9 20 18 24 T36 24 T54 24 T72 24\'/%3E%3Cpath d=\'M0 29 Q9 25 18 29 T36 29 T54 29 T72 29\'/%3E%3Cpath d=\'M0 34 Q9 30 18 34 T36 34 T54 34 T72 34\'/%3E%3C/g%3E%3C/svg%3E");' },
];
const DEFAULT_WALLPAPER = "dots";
/* swatch previews: strip the fade mask — it would clip the name label under the swatch */
function previewCSS(css){
  return css.replace(/-webkit-mask-image\s*:[^;]+;/g,"").replace(/(^|;)\s*mask-image\s*:[^;]+;/g,"$1");
}
function getSettings(){ return store.get(LS.settings, {}); }
function saveSettings(s){ store.set(LS.settings, s); }

function applyTheme(name){
  if(!THEMES.some(t=>t.id===name)) name = "classic";
  document.documentElement.dataset.theme = name;
  const s = getSettings(); s.theme = name; saveSettings(s);
  updateSettingsUI();
}
function applyWallpaper(){
  const s = getSettings();
  const name = s.wallpaper || DEFAULT_WALLPAPER;
  const wp = $("wallpaper");
  if(!wp) return;
  wp.classList.toggle("custom", name==="custom");
  if(name==="custom" && s.wallpaperData){
    wp.style.cssText = ""; // clear any preset mask/pattern first
    wp.style.backgroundImage = `url(${s.wallpaperData})`;
  } else {
    const p = WALLPAPERS.find(w=>w.id===name) || WALLPAPERS[1];
    wp.style.cssText = p.css; // atomic: replaces pattern, mask, everything
  }
  updateSettingsUI();
}
function setWallpaperCustom(dataUrl){
  const s = getSettings(); s.wallpaper = "custom"; s.wallpaperData = dataUrl; s.wpv = 2; saveSettings(s);
  applyWallpaper();
}
/* auto-levels: remap the 2nd–98th percentile of luma to 0–255 so even a flat
   or dark photo gets full tonal range (dark end melts into the LCD via
   screen blend, bright end glows). Pure function over ImageData — tested. */
function autoLevels(cx, W, H){
  const id = cx.getImageData(0, 0, W, H), d = id.data;
  const hist = new Array(256).fill(0);
  for(let i=0;i<d.length;i+=4) hist[((d[i]*3 + d[i+1]*6 + d[i+2])/10)|0]++;
  const total = W*H;
  let acc = 0, lo = 0, hi = 255;
  for(let i=0;i<256;i++){ acc += hist[i]; if(acc > total*0.02){ lo = i; break; } }
  acc = 0;
  for(let i=255;i>=0;i--){ acc += hist[i]; if(acc > total*0.02){ hi = i; break; } }
  if(hi-lo < 24){ lo = Math.max(0, lo-12); hi = Math.min(255, hi+12); } // flat image: don't over-stretch noise
  const range = Math.max(1, hi-lo);
  for(let i=0;i<d.length;i+=4) for(let k=0;k<3;k++){
    const v = (d[i+k]-lo)*255/range;
    d[i+k] = v<0 ? 0 : v>255 ? 255 : v;
  }
  cx.putImageData(id, 0, 0);
  return { lo, hi };
}
function applyBrand(){
  const s = getSettings();
  const name = String(s.brand || "CaLBoY").slice(0,14) || "CaLBoY";
  const bn = document.querySelector(".brand-name");
  if(bn) bn.textContent = name;
  const inp = $("brand-input");
  if(inp && document.activeElement!==inp) inp.value = name==="CaLBoY" ? "" : name;
}
function buildSettingsUI(){
  const tw = $("theme-swatches");
  if(tw && !tw.children.length){
    THEMES.forEach(t=>{
      const b = document.createElement("button");
      b.className = "swatch"; b.dataset.id = t.id; b.title = t.name; b.type = "button";
      b.style.background = `linear-gradient(135deg, ${t.sw[0]} 50%, ${t.sw[1]} 50%)`;
      b.innerHTML = `<span class="sw-name">${t.name}</span>`;
      b.onclick = ()=>{ Sfx.click(); applyTheme(t.id); };
      tw.appendChild(b);
    });
  }
  const ww = $("wp-swatches");
  if(ww && !ww.children.length){
    WALLPAPERS.forEach(w=>{
      const b = document.createElement("button");
      b.className = "swatch"; b.dataset.id = w.id; b.title = w.name; b.type = "button";
      b.style.cssText = previewCSS(w.css);   // pattern preview (no fade mask)…
      b.style.backgroundColor = "#e8e4d8";   // …on a light base
      b.innerHTML = `<span class="sw-name">${w.name}</span>`;
      b.onclick = ()=>{ Sfx.click(); const s=getSettings(); s.wallpaper=w.id; s.wallpaperData=null; saveSettings(s); applyWallpaper(); };
      ww.appendChild(b);
    });
  }
}
function updateSettingsUI(){
  const s = getSettings();
  document.querySelectorAll("#theme-swatches .swatch").forEach(b=>b.classList.toggle("sel", b.dataset.id===(s.theme||"classic")));
  document.querySelectorAll("#wp-swatches .swatch").forEach(b=>b.classList.toggle("sel", b.dataset.id===(s.wallpaper||DEFAULT_WALLPAPER)));
}
function bindSettings(){
  $("btn-settings").onclick = ()=>{ Sfx.click(); buildSettingsUI(); updateSettingsUI(); applyBrand(); show("screen-settings"); };
  $("btn-set-back").onclick = ()=>{ Sfx.click(); show("screen-title"); };
  // custom wallpaper upload → 320px wide (detailed, still tiny in localStorage),
  // auto-leveled, then grayscaled + pixel-block grid via CSS
  $("wp-file").addEventListener("change", e=>{
    const f = e.target.files[0]; if(!f) return;
    const img = new Image();
    img.onload = ()=>{
      URL.revokeObjectURL(img.src);
      const W = 320, H = Math.max(1, Math.round(320*img.height/img.width));
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const cx = cv.getContext("2d");
      cx.drawImage(img, 0, 0, W, H);
      autoLevels(cx, W, H); // stretch p2–p98 to full range: any photo gets punch
      setWallpaperCustom(cv.toDataURL("image/jpeg", 0.8));
      Sfx.click();
    };
    img.src = URL.createObjectURL(f);
    e.target.value = "";
  });
  $("brand-input").addEventListener("input", e=>{
    const s = getSettings();
    const v = e.target.value.slice(0,14);
    if(v.trim()) s.brand = v; else delete s.brand;
    saveSettings(s); applyBrand();
  });
  $("brand-reset").onclick = ()=>{ Sfx.click(); const s=getSettings(); delete s.brand; saveSettings(s); applyBrand(); };
}
function applySavedSettings(){
  const s = getSettings();
  // one-time wallpaper quality migration: uploads before v2 were 120px wide
  // (too pixelated to salvage) — reset to default so the user re-uploads
  // at full 320px detail with the new pixel-block grid
  if(s.wallpaper==="custom" && s.wallpaperData && s.wpv!==2){
    s.wallpaper = DEFAULT_WALLPAPER; s.wallpaperData = null; s.wpv = 2; saveSettings(s);
  }
  if(s.theme && THEMES.some(t=>t.id===s.theme)) document.documentElement.dataset.theme = s.theme;
  applyWallpaper();
  applyBrand();
}

/* ---------- boot ---------- */
/* fixed-aspect responsive: the calculator is designed at a fixed 430px width.
   fit() scales the whole thing uniformly with transform, so proportions,
   font sizes and grid alignment are identical on every device —
   whichever dimension constrains wins. */
function fit(){
  const calc = document.querySelector(".calc");
  const stage = document.getElementById("stage");
  if(!calc || !stage) return;
  const w = calc.offsetWidth, h = calc.offsetHeight; // layout px, transform-independent
  if(!w || !h) return;
  const s = Math.min((window.innerWidth - 24) / w, (window.innerHeight - 24) / h);
  const sc = Math.max(0.35, Math.min(2.5, s));
  calc.style.transform = `scale(${sc})`;
  stage.style.width = (w * sc) + "px";
  stage.style.height = (h * sc) + "px";
  positionTutArrow(); // keep the tutorial arrow glued to its column
}
function boot(){
  const s = store.get(LS.settings, { muted:false });
  Sfx.setMuted(!!s.muted);
  applyMuteUI();
  bindInput();
  bindSettings();
  applySavedSettings(); // theme / wallpaper / brand
  refreshTitle();
  show("screen-title");
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", ()=>setTimeout(fit, 120));
  if(window.visualViewport) visualViewport.addEventListener("resize", fit);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{
    fit();
    // font swap can change help page heights — refit if help is open
    if(!document.getElementById("screen-help").classList.contains("hidden")) fitHelpPages();
  });
}
document.addEventListener("DOMContentLoaded", boot);
