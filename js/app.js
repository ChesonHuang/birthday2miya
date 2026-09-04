(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const starsCanvas = $("#stars");
  const fxCanvas = $("#fx");
  const starsCtx = starsCanvas.getContext("2d");
  const fxCtx = fxCanvas.getContext("2d");

  const state = {
    phase: "letter",
    blown: false,
    audio: null,
    micStream: null,
    analyser: null,
    raf: 0,
    stars: [],
    sparks: [],
    bursts: [],
    shooting: [],
    bgmWanted: false,
    bgmMuted: false,
  };

  const BGM_VOL = 0.3;
  const BGM_DUCK = 0.08;

  function resizeCanvases() {
    const app = $("#app");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = app.clientWidth;
    const h = app.clientHeight;
    [starsCanvas, fxCanvas].forEach((c) => {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    spawnStars(w, h);
  }

  function spawnStars(w, h) {
    const count = Math.floor((w * h) / 2800);
    state.stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random(),
      s: Math.random() * 0.02 + 0.005,
      tw: Math.random() * Math.PI * 2,
    }));
  }

  function drawStars(t) {
    const w = $("#app").clientWidth;
    const h = $("#app").clientHeight;
    starsCtx.clearRect(0, 0, w, h);
    for (const s of state.stars) {
      s.tw += s.s;
      const alpha = 0.25 + Math.sin(s.tw) * 0.35 + s.a * 0.2;
      starsCtx.fillStyle = `rgba(255, 220, 232, ${Math.max(0.08, alpha)})`;
      starsCtx.beginPath();
      starsCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      starsCtx.fill();
    }
    if (Math.random() < 0.008 && state.shooting.length < 2) {
      state.shooting.push({
        x: Math.random() * w * 0.8,
        y: Math.random() * h * 0.35,
        len: 50 + Math.random() * 70,
        life: 0,
      });
    }
    state.shooting = state.shooting.filter((m) => m.life < 1);
    for (const m of state.shooting) {
      m.life += 0.018;
      m.x += 6;
      m.y += 3.2;
      const g = starsCtx.createLinearGradient(m.x, m.y, m.x - m.len, m.y - m.len * 0.5);
      g.addColorStop(0, "rgba(255,210,225,0.9)");
      g.addColorStop(1, "rgba(255,210,225,0)");
      starsCtx.strokeStyle = g;
      starsCtx.lineWidth = 1.4;
      starsCtx.beginPath();
      starsCtx.moveTo(m.x, m.y);
      starsCtx.lineTo(m.x - m.len, m.y - m.len * 0.5);
      starsCtx.stroke();
    }
  }

  function spawnPetals() {
    const box = $("#petals");
    box.innerHTML = "";
    for (let i = 0; i < 20; i++) {
      const el = document.createElement("span");
      el.className = Math.random() < 0.42 ? "heart-fall" : "petal";
      el.style.left = `${Math.random() * 100}%`;
      el.style.setProperty("--drift", `${(Math.random() * 80 - 40).toFixed(0)}px`);
      el.style.animationDuration = `${9 + Math.random() * 10}s`;
      el.style.animationDelay = `${Math.random() * 8}s`;
      el.style.transform = el.className === "heart-fall"
        ? `rotate(45deg) scale(${0.55 + Math.random() * 0.7})`
        : `scale(${0.6 + Math.random() * 0.7})`;
      box.appendChild(el);
    }
  }

  function buildBeads() {
    const box = $(".beads");
    if (!box) return;
    const spots = [
      [38, 132], [78, 128], [158, 130],
      [28, 88], [108, 84], [178, 90],
      [52, 46], [148, 48],
    ];
    box.innerHTML = spots
      .map(([left, bottom]) => `<span style="left:${left}px;bottom:${bottom}px"></span>`)
      .join("");
  }

  function buildCandles() {
    const wrap = $("#candles");
    wrap.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      const c = document.createElement("div");
      c.className = "candle";
      c.innerHTML = `<span class="wick"></span><span class="flame"></span><span class="smoke"></span>`;
      wrap.appendChild(c);
    }
  }

  function bgmEl() {
    return $("#bgm");
  }

  function bgmVolume() {
    return state.phase === "cake" ? BGM_DUCK : BGM_VOL;
  }

  function updateBgmUi() {
    const btn = $("#bgm-toggle");
    if (!btn) return;
    btn.classList.toggle("is-muted", state.bgmMuted);
    btn.setAttribute("aria-pressed", state.bgmMuted ? "true" : "false");
    btn.setAttribute("aria-label", state.bgmMuted ? "打开背景音乐" : "关闭背景音乐");
  }

  function startBgm() {
    const a = bgmEl();
    if (!a || state.bgmMuted) return;
    state.bgmWanted = true;
    a.volume = bgmVolume();
    const play = a.play();
    if (play && play.catch) play.catch(() => {});
  }

  function toggleBgm(event) {
    event.stopPropagation();
    state.bgmMuted = !state.bgmMuted;
    const a = bgmEl();
    if (state.bgmMuted) {
      a?.pause();
    } else {
      startBgm();
    }
    updateBgmUi();
  }

  function ensureAudio() {
    if (state.audio) return state.audio;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    state.audio = new Ctx();
    return state.audio;
  }

  function tone(freq, dur, type = "sine", gain = 0.07, delay = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function chimeOpen() {
    [523.25, 659.25, 783.99, 987.77].forEach((f, i) => {
      tone(f, 1.15, "sine", 0.045, i * 0.11);
    });
  }

  function chimeWish() {
    [392, 523.25, 659.25, 784, 1046.5].forEach((f, i) => {
      tone(f, 1.4, "triangle", 0.04, i * 0.13);
    });
  }

  function puffSound() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.28, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 700;
    g.gain.setValueAtTime(0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
  }

  function burst(x, y, n = 48, palette) {
    const colors = palette || ["#fff0f5", "#ffb7c8", "#ffd0de", "#ffe4a8", "#e8b4d4", "#ffffff"];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 4.8;
      state.bursts.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.2,
        life: 1,
        decay: 0.008 + Math.random() * 0.012,
        r: 1 + Math.random() * 2.4,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }

  function goldDust(x, y) {
    for (let i = 0; i < 36; i++) {
      state.sparks.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 1.6,
        vy: -Math.random() * 1.8 - 0.4,
        life: 1,
        r: Math.random() * 1.8 + 0.5,
      });
    }
  }

  function drawFx() {
    const w = $("#app").clientWidth;
    const h = $("#app").clientHeight;
    fxCtx.clearRect(0, 0, w, h);
    state.sparks = state.sparks.filter((p) => p.life > 0);
    for (const p of state.sparks) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.012;
      fxCtx.fillStyle = `rgba(243, 150, 180, ${Math.max(0, p.life)})`;
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fxCtx.fill();
    }
    state.bursts = state.bursts.filter((p) => p.life > 0);
    for (const p of state.bursts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.045;
      p.life -= p.decay;
      fxCtx.fillStyle = p.color;
      fxCtx.globalAlpha = Math.max(0, p.life);
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fxCtx.fill();
      fxCtx.globalAlpha = 1;
    }
  }

  function loop(t) {
    drawStars(t);
    drawFx();
    listenBlow();
    state.raf = requestAnimationFrame(loop);
  }

  function setPhase(name) {
    state.phase = name;
    document.body.className = `phase-${name}`;
    $$(".scene").forEach((s) => {
      const on = s.id === `scene-${name}`;
      s.classList.toggle("active", on);
      s.setAttribute("aria-hidden", on ? "false" : "true");
    });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function openEnvelope() {
    if (state.phase !== "letter") return;
    const env = $("#envelope");
    if (env.classList.contains("is-opening")) return;
    ensureAudio()?.resume();
    startBgm();
    env.classList.add("is-opening");
    $("#letter-hint").style.opacity = "0";
    const rect = env.getBoundingClientRect();
    const app = $("#app").getBoundingClientRect();
    goldDust(rect.left - app.left + rect.width / 2, rect.top - app.top + 70);
    chimeOpen();
    if (navigator.vibrate) navigator.vibrate(30);
    await wait(900);
    setPhase("reveal");
    burst($("#app").clientWidth / 2, 120, 28);
    window.clearTimeout(state.autoTimer);
    state.autoTimer = window.setTimeout(() => {
      if (state.phase === "reveal") goCake();
    }, 5200);
  }

  function goCake() {
    window.clearTimeout(state.autoTimer);
    if (state.phase !== "reveal") return;
    setPhase("cake");
    startBgm();
    startMic();
  }

  async function startMic() {
    if (state.analyser || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      state.micStream = stream;
      const ctx = ensureAudio();
      if (!ctx) return;
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      state.analyser = analyser;
    } catch {
      /* 无麦克风时仍可点蛋糕或按钮许愿 */
    }
  }

  function stopMic() {
    state.analyser = null;
    if (state.micStream) {
      state.micStream.getTracks().forEach((t) => t.stop());
      state.micStream = null;
    }
  }

  function listenBlow() {
    if (state.phase !== "cake" || state.blown || !state.analyser) return;
    const buf = new Uint8Array(state.analyser.fftSize);
    state.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    if (rms > 0.085) blowCandles();
  }

  async function blowCandles() {
    if (state.phase !== "cake" || state.blown) return;
    state.blown = true;
    const cake = $("#cake");
    cake.classList.add("blowing");
    puffSound();
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    await wait(280);
    const candles = $$(".candle");
    for (const c of candles) {
      c.classList.add("out");
      await wait(110);
    }
    cake.classList.remove("blowing");
    cake.classList.add("extinguished");
    await wait(420);
    stopMic();
    const app = $("#app");
    burst(app.clientWidth / 2, app.clientHeight * 0.42, 90);
    burst(app.clientWidth * 0.3, app.clientHeight * 0.35, 40);
    burst(app.clientWidth * 0.7, app.clientHeight * 0.35, 40);
    chimeWish();
    setPhase("wish");
    startBgm();
    window.clearTimeout(state.autoTimer);
    state.autoTimer = window.setTimeout(() => {
      if (state.phase === "wish") goFinale();
    }, 5600);
  }

  function goFinale() {
    window.clearTimeout(state.autoTimer);
    if (state.phase !== "wish") return;
    setPhase("finale");
    $("#letter-card").scrollTop = 0;
  }

  function replay() {
    window.clearTimeout(state.autoTimer);
    stopMic();
    state.blown = false;
    $$(".candle").forEach((c) => c.classList.remove("out"));
    $("#cake").classList.remove("extinguished", "blowing");
    $("#envelope").classList.remove("is-opening");
    $("#letter-hint").style.opacity = "";
    setPhase("letter");
  }

  function bind() {
    $("#bgm-toggle").addEventListener("click", toggleBgm);
    $("#envelope").addEventListener("click", openEnvelope);
    $("#to-cake").addEventListener("click", goCake);
    $("#cake").addEventListener("click", blowCandles);
    $("#blow-btn").addEventListener("click", blowCandles);
    $("#to-finale").addEventListener("click", goFinale);
    $("#replay").addEventListener("click", replay);
    $("#scene-reveal").addEventListener("click", goCake);
    $("#scene-wish").addEventListener("click", goFinale);
    window.addEventListener("resize", resizeCanvases);

    const boot = new URLSearchParams(location.search).get("scene");
    if (boot && $(`#scene-${boot}`)) {
      setPhase(boot);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopMic();
        bgmEl()?.pause();
      } else if (state.bgmWanted && !state.bgmMuted) {
        startBgm();
      }
    });
    updateBgmUi();
  }

  function init() {
    spawnPetals();
    buildCandles();
    buildBeads();
    resizeCanvases();
    bind();
    requestAnimationFrame(loop);
  }

  init();
})();
