/* ============ DROP 7 MAGIC — retro SFX (Web Audio, no assets) ============ */
const Sfx = (() => {
  let ctx = null, master = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  // generic blip: square/triangle osc with pitch envelope
  function blip({ f0 = 440, f1 = null, type = "square", dur = 0.08, vol = 0.25, delay = 0 }) {
    if (muted) return;
    try {
      const c = ac(), t0 = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      env(g, t0, 0.005, vol, dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) { /* audio unavailable */ }
  }
  // tiny noise burst for cracks/shatters
  function noise({ dur = 0.06, vol = 0.2, delay = 0, hp = 1200 }) {
    if (muted) return;
    try {
      const c = ac(), t0 = c.currentTime + delay;
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
      const g = c.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0);
    } catch (e) { /* audio unavailable */ }
  }

  return {
    setMuted(m) { muted = !!m; },
    isMuted() { return muted; },
    unlock() { try { ac(); } catch (e) {} },           // call on first user gesture
    click()  { blip({ f0: 660, f1: 520, type: "square", dur: 0.05, vol: 0.15 }); },
    move()   { blip({ f0: 880, type: "square", dur: 0.03, vol: 0.08 }); },
    drop()   { blip({ f0: 300, f1: 140, type: "triangle", dur: 0.1, vol: 0.3 }); },
    deny()   { blip({ f0: 160, f1: 110, type: "sawtooth", dur: 0.12, vol: 0.2 }); },
    pop(chain) {
      const base = 420 * Math.pow(1.25, Math.min(chain, 8));
      blip({ f0: base, f1: base * 1.6, type: "square", dur: 0.09, vol: 0.28 });
      blip({ f0: base * 2, type: "triangle", dur: 0.06, vol: 0.12, delay: 0.03 });
    },
    crack()  { noise({ dur: 0.07, vol: 0.25, hp: 900 }); blip({ f0: 220, f1: 140, type: "square", dur: 0.06, vol: 0.15 }); },
    shatter(){ noise({ dur: 0.14, vol: 0.3, hp: 600 }); },
    reveal() { blip({ f0: 520, f1: 1040, type: "triangle", dur: 0.12, vol: 0.25 }); blip({ f0: 1040, f1: 1560, type: "square", dur: 0.09, vol: 0.12, delay: 0.09 }); },
    levelup(){ [523, 659, 784, 1047].forEach((f, i) => blip({ f0: f, type: "square", dur: 0.1, vol: 0.22, delay: i * 0.09 })); },
    gameover(){ [392, 330, 262, 196].forEach((f, i) => blip({ f0: f, type: "triangle", dur: 0.18, vol: 0.28, delay: i * 0.16 })); },
    fanfare(){ [523, 659, 784].forEach((f, i) => blip({ f0: f, type: "square", dur: 0.09, vol: 0.2, delay: i * 0.08 })); },
    bonus()  { [1047, 1319].forEach((f, i) => blip({ f0: f, type: "triangle", dur: 0.08, vol: 0.22, delay: i * 0.06 })); },
    /* longer original combo-celebration jingle for chain x7 (~2.2s): bouncy major-key
       call & response over a driving drum track (synthesized kick/snare/hats) */
    combo(){
      const lead = [ // [freq, start, dur]
        [659,0.00,.11],[784,0.11,.11],[1047,0.22,.11],[1319,0.33,.13],
        [1568,0.48,.11],[1319,0.59,.11],[1568,0.70,.11],[1319,0.81,.13],
        [1047,0.96,.11],[784,1.07,.11],[880,1.18,.11],[1047,1.29,.13],
        [1175,1.44,.11],[1319,1.55,.11],[1568,1.66,.11],[2093,1.77,.30]
      ];
      lead.forEach(([f,t,d])=>blip({ f0:f, type:"square", dur:d, vol:0.20, delay:t }));
      const bass = [ // bouncing bassline underneath
        [262,0.00],[262,0.22],[294,0.44],[330,0.66],[349,0.88],[392,1.10],[440,1.32],[523,1.54]
      ];
      bass.forEach(([f,t])=>blip({ f0:f, type:"triangle", dur:0.16, vol:0.14, delay:t }));
      [2093,2637].forEach((f,i)=>blip({ f0:f, type:"triangle", dur:0.22, vol:0.10, delay:1.80+i*0.13 }));
      // --- drums: four-on-the-floor kicks, backbeat snare, driving hats ---
      const kick  = (t)=>blip({ f0:150, f1:44, type:"sine", dur:0.14, vol:0.55, delay:t });
      const snare = (t)=>{ noise({ dur:0.09, vol:0.32, delay:t, hp:1800 });
                           blip({ f0:190, type:"triangle", dur:0.06, vol:0.20, delay:t }); };
      const hat   = (t)=>noise({ dur:0.03, vol:0.10, delay:t, hp:6500 });
      const beats = [0,0.27,0.54,0.81,1.08,1.35,1.62,1.89];
      beats.forEach(kick);
      [0.54,1.08,1.62].forEach(snare);
      beats.forEach((t,i)=>{ hat(t); if(i<beats.length-1) hat(t+0.135); });
    },
    magic()  { [880, 1175, 1568, 2093].forEach((f, i) => blip({ f0: f, type: "triangle", dur: 0.09, vol: 0.16, delay: i * 0.06 })); },
    shiftSfx(d){ if(d===0){ blip({ f0: 440, type: "square", dur: 0.07, vol: 0.18 }); return; }
      blip({ f0: d>0?300:900, f1: d>0?900:300, type: "square", dur: 0.16, vol: 0.22 }); },
    peekSfx(){ [1047, 1319, 1568].forEach((f, i) => blip({ f0: f, type: "sine", dur: 0.12, vol: 0.18, delay: i * 0.07 })); },
    cycleSfx(){ [660, 660, 880].forEach((f, i) => blip({ f0: f, type: "square", dur: 0.05, vol: 0.16, delay: i * 0.07 })); },
    unifySfx(){ [196, 247, 294].forEach((f) => blip({ f0: f, type: "square", dur: 0.22, vol: 0.16 })); },
  };
})();
