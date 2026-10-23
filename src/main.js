import './style.css';
import questions from './questions.js';

// One colour pair per Part, each with its own ink.
const PALETTE = [
  { bg: '#e4572e', bg2: '#f2a93b', ink: '#1a0a05' },
  { bg: '#2f9e8f', bg2: '#86d8c4', ink: '#04201b' },
  { bg: '#cdbfae', bg2: '#f3e9db', ink: '#1c1814' },
  { bg: '#a3334a', bg2: '#5e1a2a', ink: '#fbeee9' },
  { bg: '#3d74b8', bg2: '#24497e', ink: '#f4f7fb' },
  { bg: '#7d9a3c', bg2: '#c2d45a', ink: '#111a04' },
];

// Mosaic spans: the first Part is the large tile; on a phone the last one takes the full row.
const SPANS = ['col-span-2 sm:row-span-2', '', '', '', '', 'col-span-2 sm:col-span-1'];

const parts = [];
questions.forEach((q, i) => {
  let p = parts.find(x => x.category === q.category);
  if (!p) {
    const [num, ...rest] = q.category.split(':');
    p = { category: q.category, num: num.trim(), name: rest.join(':').trim() || num.trim(), ids: [], ...PALETTE[parts.length % PALETTE.length] };
    p.grad = `linear-gradient(135deg, ${p.bg}, ${p.bg2})`;
    parts.push(p);
  }
  q.part = p;
  p.ids.push(i);
});

const stripKey = s => s.replace(/^[A-D]\.\s+/, '');
const stripNum = s => s.replace(/^\d+\.\s*/, '');
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const shuffle = a => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

const $ = id => document.getElementById(id);
const view = $('view'), hud = $('hud'), scoreEl = $('score'), strip = $('strip');

const KEY = 'art-quiz-bee-v1';
const BEST_KEY = 'art-quiz-bee-best';
const AUTO_NEXT_MS = 1200;
const CLOCK_MS = 60000;

let mode = 'start'; // start | review | clock
let state = null;   // review: { set: [question indices], pos, answers: { [qIndex]: chosen } }
let game = null;    // clock
let autoTimer = 0;

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const clear = () => { try { localStorage.removeItem(KEY); } catch {} };
const getBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const setBest = v => { try { localStorage.setItem(BEST_KEY, String(v)); } catch {} };

const scoreOf = s => Object.entries(s.answers).filter(([i, a]) => questions[i].answer === a).length;

function stopAll() {
  clearTimeout(autoTimer);
  if (game) { game.running = false; cancelAnimationFrame(game.raf); }
}

function setChrome(screen) {
  const inReview = screen === 'review';
  hud.classList.toggle('hidden', !(inReview || screen === 'result'));
  strip.classList.toggle('hidden', !inReview);
}

function rise(el, i) {
  el.classList.add('animate-rise');
  el.style.animationDelay = `${i * 70}ms`;
}

function setNext(label, enabled) {
  $('next').disabled = !enabled;
  $('next-label').textContent = label;
  $('next-arrow').classList.toggle('hidden', !enabled);
}

const BTN_PRIMARY = 'group min-h-13 px-6 rounded-xl font-semibold inline-flex items-center justify-center gap-2 text-ground transition-all duration-300 bg-linear-to-r from-amber via-amber-hi to-flame bg-[length:200%_auto] hover:bg-right shadow-[0_0_24px_-4px_rgba(242,169,59,.6)] hover:shadow-[0_0_36px_-2px_rgba(242,169,59,.8)] active:scale-[.98]';
const BTN_GHOST = 'min-h-13 px-6 rounded-xl font-semibold border border-white/10 bg-white/[.04] backdrop-blur-sm hover:bg-white/[.08] hover:border-white/25 active:scale-[.98] transition';

// ---------- Shared question markup ----------
const OPT_BASE = 'opt group w-full flex items-center gap-4 px-4 py-3 rounded-xl border text-left transition duration-200 focus-visible:outline-2 focus-visible:outline-amber';
const OPT_IDLE = 'bg-white/[.04] border-white/10 backdrop-blur-sm hover:bg-white/[.08] hover:border-(--part) hover:shadow-[0_0_28px_-6px_var(--part)] active:scale-[.99]';
const OPT_RIGHT = 'bg-linear-to-r from-amber to-amber-hi border-transparent text-ground shadow-[0_0_32px_-2px_rgba(242,169,59,.65)]';
const OPT_WRONG = 'bg-bad/10 border-bad/60 text-bad animate-shake';
const OPT_DIM = 'bg-white/[.03] border-white/5 opacity-45';
const KEY_BASE = 'key size-8 shrink-0 grid place-items-center rounded-lg text-sm font-semibold transition-colors';

// The review mode's Next button, placed beside the feedback line.
const NEXT_BTN = `
  <button id="next" disabled
    class="group w-full sm:w-auto sm:shrink-0 sm:min-w-52 min-h-13 px-6 rounded-xl font-semibold text-base inline-flex items-center justify-center gap-2 transition-all duration-300
           bg-linear-to-r from-amber via-amber-hi to-flame bg-[length:200%_auto] hover:bg-right text-ground
           shadow-[0_0_24px_-4px_rgba(242,169,59,.6)] hover:shadow-[0_0_36px_-2px_rgba(242,169,59,.8)] active:scale-[.98]
           disabled:bg-none disabled:bg-white/[.04] disabled:text-faint disabled:shadow-none disabled:active:scale-100
           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber">
    <span id="next-label">Pick an answer</span>
    <span id="next-arrow" class="hidden transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
  </button>`;

function questionMarkup(q, corner, actions = '') {
  const p = q.part;
  const isTF = q.options.length === 2;
  const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
  const size = isTF ? 'min-h-20 justify-center' : 'min-h-15';
  const move = isTF ? 'hover:-translate-y-0.5' : 'hover:translate-x-1';
  return `
    <div class="band rounded-xl px-4 sm:px-6 py-4 sm:py-5 flex items-baseline justify-between gap-4"
         style="background:${p.grad};color:${p.ink};box-shadow:0 12px 40px -14px ${p.bg}">
      <p class="text-lg sm:text-[22px] font-semibold tracking-tight leading-tight">${esc(p.name)}</p>
      <p class="text-sm sm:text-base tabular-nums whitespace-nowrap opacity-80">${corner}</p>
    </div>

    <p id="qtext" class="mt-8 sm:mt-10 text-[22px] sm:text-[30px] leading-[1.3] font-medium tracking-[-0.015em] max-w-[34ch]">${esc(stripNum(q.question))}</p>

    <div role="group" aria-labelledby="qtext" class="mt-8 grid gap-2.5 ${isTF ? 'grid-cols-2' : ''}">
      ${q.options.map((o, i) => `
        <button data-opt="${esc(o)}" data-size="${size} ${move}" class="${OPT_BASE} ${size} ${move} ${OPT_IDLE}">
          ${isTF ? '' : `<span class="${KEY_BASE} bg-white/10 text-muted group-hover:bg-(--part) group-hover:text-(--part-ink)">${keys[i]}</span>`}
          <span class="${isTF ? 'text-center font-semibold text-xl' : 'flex-1 text-[17px] sm:text-lg leading-snug'}">${esc(stripKey(o))}</span>
          <span class="tag text-sm font-semibold hidden"></span>
        </button>`).join('')}
    </div>

    <div class="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div id="feedback" class="min-h-7 text-lg" aria-live="polite"></div>
      ${actions}
    </div>`;
}

function markOptions(q, chosen) {
  view.querySelectorAll('.opt').forEach(b => {
    const o = b.dataset.opt;
    const key = b.querySelector('.key');
    const tag = b.querySelector('.tag');
    const size = b.dataset.size.split(' ')[0] === 'min-h-20' ? 'min-h-20 justify-center' : 'min-h-15';
    b.disabled = true;
    if (o === q.answer) {
      b.className = `${OPT_BASE} ${size} ${OPT_RIGHT}`;
      if (key) key.className = `${KEY_BASE} bg-ground/15 text-ground`;
      tag.textContent = 'Correct';
      tag.classList.remove('hidden');
    } else if (o === chosen) {
      b.className = `${OPT_BASE} ${size} ${OPT_WRONG}`;
      if (key) key.className = `${KEY_BASE} bg-bad/15 text-bad`;
      tag.textContent = 'Your answer';
      tag.classList.remove('hidden');
    } else {
      b.className = `${OPT_BASE} ${size} ${OPT_DIM}`;
      if (key) key.className = `${KEY_BASE} bg-white/10 text-muted`;
    }
  });
}

function partStyle(p) {
  return `--part:${p.bg};--part-ink:${p.ink}`;
}

// ---------- Start ----------
function renderStart() {
  stopAll();
  mode = 'start';
  setChrome('start');
  const saved = load();
  const resumable = saved && saved.pos < saved.set.length && Object.keys(saved.answers).length > 0;
  const best = getBest();

  view.innerHTML = `
    <section class="grid gap-6">
      <h2 class="text-[42px] leading-[0.95] sm:text-[84px] font-semibold tracking-[-0.04em] text-balance pb-2
                 bg-linear-to-r from-ink via-amber to-flame bg-[length:200%_auto] bg-clip-text text-transparent animate-shine">Reading Visual Art Reviewer</h2>
      <p class="text-lg sm:text-xl max-w-[46ch] leading-relaxed text-muted">
        115 questions, from the elements of art to symbolism and iconography. Review it all, or race the clock.
      </p>
    </section>

    <section class="mt-10 grid sm:grid-cols-2 gap-3">
      <button data-act="${resumable ? 'resume' : 'all'}"
        class="group relative overflow-hidden rounded-2xl p-6 sm:p-8 text-left border border-white/10 bg-white/[.04] backdrop-blur-md transition duration-300
               hover:-translate-y-1 hover:border-amber/60 hover:shadow-[0_0_48px_-10px_rgba(242,169,59,.7)]
               focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber">
        <span class="absolute -top-20 -right-20 size-56 rounded-full bg-amber/30 blur-3xl transition-transform duration-500 group-hover:scale-150"></span>
        <span class="relative block text-sm font-semibold text-amber">Review</span>
        <span class="relative block mt-2 text-[28px] sm:text-4xl font-semibold tracking-tight leading-tight">
          ${resumable ? `Continue at question ${saved.pos + 1}` : `All ${questions.length} questions`}
        </span>
        <span class="relative block mt-3 text-muted leading-relaxed">Get one right and you move straight on. Get one wrong and you see the answer before the next.</span>
        <span class="relative mt-6 inline-flex items-center gap-2 font-semibold text-amber">
          ${resumable ? 'Continue' : 'Start review'} <span class="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
        </span>
      </button>

      <button data-act="clock"
        class="group relative overflow-hidden rounded-2xl p-6 sm:p-8 text-left border border-white/10 bg-white/[.04] backdrop-blur-md transition duration-300
               hover:-translate-y-1 hover:border-flame/60 hover:shadow-[0_0_48px_-10px_rgba(228,87,46,.75)]
               focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-flame">
        <span class="absolute -top-20 -right-20 size-56 rounded-full bg-flame/35 blur-3xl transition-transform duration-500 group-hover:scale-150"></span>
        <span class="relative flex items-center justify-between gap-3 text-sm font-semibold">
          <span class="text-flame">Game</span>
          <span class="text-muted tabular-nums">${best ? `Best ${best.toLocaleString()}` : 'No best yet'}</span>
        </span>
        <span class="relative block mt-2 text-[28px] sm:text-4xl font-semibold tracking-tight leading-tight">Beat the clock</span>
        <span class="relative block mt-3 text-muted leading-relaxed">60 seconds. +3s for a right answer, −5s for a wrong one. Streaks build a multiplier.</span>
        <span class="relative mt-6 inline-flex items-center gap-2 font-semibold text-flame">
          Play <span class="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
        </span>
      </button>
    </section>
    ${resumable ? `<button data-act="all" class="mt-3 text-sm text-muted underline underline-offset-4 hover:text-ink">Start the review over</button>` : ''}

    <section class="mt-16 sm:mt-24">
      <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">Or review one part</h2>
      <ul class="mt-6 grid grid-cols-2 sm:grid-cols-3 auto-rows-[136px] sm:auto-rows-[176px] gap-2.5">
        ${parts.map((p, i) => `
          <li class="${SPANS[i] || ''}">
            <button data-part="${i}" style="background:${p.grad};color:${p.ink};--glow:${p.bg}"
              class="group relative overflow-hidden h-full w-full rounded-2xl p-4 sm:p-6 flex flex-col justify-between text-left transition duration-300 ease-out
                     hover:-translate-y-1 hover:shadow-[0_18px_48px_-12px_var(--glow)] active:translate-y-0 active:scale-[.99]
                     focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber">
              <span class="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"></span>
              <span class="relative flex items-baseline justify-between gap-2 text-sm opacity-80 tabular-nums">
                <span>${esc(p.num)}</span><span>${p.ids.length} questions</span>
              </span>
              <span class="relative flex items-end justify-between gap-3">
                <span class="font-semibold tracking-[-0.02em] leading-[1.05] ${i === 0 ? 'text-[28px] sm:text-[56px]' : 'text-xl sm:text-[26px]'}">${esc(p.name)}</span>
                <span class="text-xl transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
              </span>
            </button>
          </li>`).join('')}
      </ul>
    </section>`;

  view.querySelectorAll(':scope > section, :scope > button').forEach(rise);
  view.querySelectorAll('li').forEach((li, i) => rise(li, i + 3));
  view.querySelectorAll('[data-act="all"]').forEach(b => { b.onclick = () => beginReview(questions.map((_, i) => i)); });
  const r = view.querySelector('[data-act="resume"]');
  if (r) r.onclick = () => { state = saved; mode = 'review'; renderQuestion(); };
  view.querySelector('[data-act="clock"]').onclick = startClock;
  view.querySelectorAll('[data-part]').forEach(b => { b.onclick = () => beginReview(parts[+b.dataset.part].ids); });
}

// ---------- Review mode ----------
function beginReview(set) {
  stopAll();
  mode = 'review';
  state = { set, pos: 0, answers: {} };
  save();
  renderQuestion();
}

function renderStrip() {
  const inSet = parts.filter(p => p.ids.some(i => state.set.includes(i)));
  $('strip-bars').innerHTML = inSet.map(p => {
    const ids = p.ids.filter(i => state.set.includes(i));
    const done = ids.filter(i => i in state.answers).length;
    return `<div class="relative rounded-full" style="flex:${ids.length} 1 0;background:${p.bg}26">
      <div class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
           style="width:${done / ids.length * 100}%;background:${p.grad};box-shadow:0 0 12px ${p.bg}"></div>
    </div>`;
  }).join('');
}

function renderQuestion() {
  clearTimeout(autoTimer);
  if (state.pos >= state.set.length) return renderResult();
  setChrome('review');
  scoreEl.textContent = scoreOf(state);
  renderStrip();

  const qi = state.set[state.pos];
  const q = questions[qi];

  view.innerHTML = `<section aria-labelledby="qtext" class="max-w-3xl mx-auto" style="${partStyle(q.part)}">
    ${questionMarkup(q, `${state.pos + 1} / ${state.set.length}`, NEXT_BTN)}
  </section>`;

  [...view.querySelector('section').children].forEach(rise);
  view.querySelectorAll('.opt').forEach((b, i) => { rise(b, i + 2); b.onclick = () => chooseReview(b.dataset.opt); });
  $('next').onclick = () => { if (!$('next').disabled) advanceReview(); };
  setNext('Pick an answer', false);

  // Revisiting an answered question (after a reload) shows its result without moving on.
  if (qi in state.answers) showReviewAnswer(state.answers[qi], false);
}

function chooseReview(option) {
  const qi = state.set[state.pos];
  if (qi in state.answers) return;
  state.answers[qi] = option;
  save();
  showReviewAnswer(option, true);
}

function showReviewAnswer(chosen, fresh) {
  const q = questions[state.set[state.pos]];
  const right = chosen === q.answer;
  markOptions(q, chosen);

  const fb = $('feedback');
  if (right) {
    fb.innerHTML = `
      <span class="font-semibold bg-linear-to-r from-amber to-flame bg-clip-text text-transparent">Correct!</span>
      ${fresh ? `<span class="block mt-3 h-1 max-w-60 rounded-full bg-white/10 overflow-hidden">
        <span id="auto" class="block h-full w-full origin-left rounded-full bg-linear-to-r from-amber to-flame" style="transition:transform ${AUTO_NEXT_MS}ms linear"></span>
      </span>` : ''}`;
  } else {
    fb.innerHTML = `<span class="text-muted">The answer is</span> <span class="font-semibold text-amber">${esc(stripKey(q.answer))}</span>.`;
  }

  scoreEl.textContent = scoreOf(state);
  if (fresh && right) {
    scoreEl.classList.remove('animate-pop');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('animate-pop');
  }
  renderStrip();

  const last = state.pos + 1 >= state.set.length;
  setNext(last ? 'See my result' : 'Next question', true);

  if (fresh && right) {
    // Right answers move on by themselves; the bar under "Correct!" shows the wait.
    requestAnimationFrame(() => requestAnimationFrame(() => { const a = $('auto'); if (a) a.style.transform = 'scaleX(0)'; }));
    autoTimer = setTimeout(advanceReview, AUTO_NEXT_MS);
  } else if (fresh) {
    const n = $('next');
    n.focus({ preventScroll: true });
    // On a short phone screen, bring the answer and the button into view.
    n.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  }
}

function advanceReview() {
  clearTimeout(autoTimer);
  if (mode !== 'review' || !state) return;
  state.pos++;
  save();
  renderQuestion();
  window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
}

function countUp(el, to, dur = 1100) {
  if (reduced()) { el.textContent = to.toLocaleString(); return; }
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function missedList(items) {
  return `
    <section class="mt-16">
      <h2 class="text-2xl font-semibold tracking-tight">The ${items.length} you missed</h2>
      <ul class="mt-5 grid gap-2">
        ${items.map(({ i, chosen }) => {
          const q = questions[i];
          return `<li class="rounded-xl border border-white/10 bg-white/[.04] backdrop-blur-sm px-4 sm:px-5 py-4">
            <p class="text-[17px] leading-snug flex gap-3"><span class="mt-[7px] size-2.5 shrink-0 rounded-full" style="background:${q.part.grad};box-shadow:0 0 10px ${q.part.bg}"></span><span>${esc(stripNum(q.question))}</span></p>
            <p class="mt-3 text-sm"><span class="text-muted">You said</span> <span class="text-bad font-semibold">${esc(stripKey(chosen || '-'))}</span></p>
            <p class="mt-1 text-sm"><span class="text-muted">Answer</span> <span class="text-amber font-semibold">${esc(stripKey(q.answer))}</span></p>
          </li>`;
        }).join('')}
      </ul>
    </section>`;
}

function renderResult() {
  setChrome('result');
  const total = state.set.length;
  const score = scoreOf(state);
  scoreEl.textContent = score;
  const pct = Math.round(score / total * 100);
  const line = pct >= 90 ? 'Exceptional work.' : pct >= 75 ? 'Great job.' : pct >= 50 ? 'Good effort.' : 'Keep studying.';
  const missed = state.set.filter(i => state.answers[i] !== questions[i].answer).map(i => ({ i, chosen: state.answers[i] }));
  const inSet = parts.filter(p => p.ids.some(i => state.set.includes(i)));

  view.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <section>
        <p class="text-[96px] sm:text-[160px] leading-[0.9] font-semibold tracking-[-0.05em] tabular-nums pb-2
                  bg-linear-to-r from-amber via-amber-hi to-flame bg-[length:200%_auto] bg-clip-text text-transparent animate-shine"><span id="pct">0</span>%</p>
        <h2 class="mt-4 text-[32px] sm:text-[44px] leading-none font-semibold tracking-[-0.03em]">${line}</h2>
        <p class="mt-4 text-lg sm:text-xl">
          You scored <span class="font-semibold tabular-nums">${score}</span> out of <span class="tabular-nums">${total}</span>.
        </p>
      </section>

      <section class="mt-14">
        <h2 class="text-2xl font-semibold tracking-tight">By part</h2>
        <ul class="mt-5 grid gap-4">
          ${inSet.map(p => {
            const ids = p.ids.filter(i => state.set.includes(i));
            const ok = ids.filter(i => state.answers[i] === questions[i].answer).length;
            return `<li>
              <div class="flex items-baseline justify-between gap-4">
                <span class="font-semibold">${esc(p.name)}</span>
                <span class="tabular-nums text-muted">${ok} / ${ids.length}</span>
              </div>
              <div class="mt-2 h-3 rounded-full" style="background:${p.bg}26">
                <div class="fill h-full rounded-full transition-[width] duration-1000 ease-out" style="width:0;background:${p.grad};box-shadow:0 0 14px ${p.bg}" data-w="${ok / ids.length * 100}"></div>
              </div>
            </li>`;
          }).join('')}
        </ul>
      </section>

      <div class="mt-12 flex flex-col sm:flex-row gap-3">
        <button data-act="again" class="${BTN_PRIMARY}">Review again</button>
        <button data-act="clock" class="${BTN_GHOST}">Play Beat the clock</button>
        <button data-act="home" class="${BTN_GHOST}">Choose a part</button>
      </div>

      ${missed.length ? missedList(missed) : ''}
    </div>`;

  [...view.firstElementChild.children].forEach(rise);
  countUp($('pct'), pct);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    view.querySelectorAll('.fill').forEach(f => { f.style.width = f.dataset.w + '%'; });
  }));

  const set = state.set;
  view.querySelector('[data-act="again"]').onclick = () => beginReview(set);
  view.querySelector('[data-act="clock"]').onclick = startClock;
  view.querySelector('[data-act="home"]').onclick = renderStart;
  clear();
}

// ---------- Beat the clock ----------
function startClock() {
  stopAll();
  mode = 'clock';
  setChrome('clock');
  game = {
    deck: shuffle(questions.map((_, i) => i)), pos: 0,
    score: 0, streak: 0, mult: 1, maxMult: 1, right: 0, wrong: 0, missed: [],
    left: CLOCK_MS, last: performance.now(), running: true, locked: false, raf: 0,
  };

  view.innerHTML = `
    <section class="max-w-3xl mx-auto">
      <div class="flex items-end justify-between gap-4">
        <div class="relative">
          <p class="text-sm text-muted">Time left</p>
          <p id="clock" class="text-[56px] sm:text-[80px] leading-none font-semibold tabular-nums tracking-[-0.04em]">1:00</p>
          <div id="fx-time" class="absolute left-full top-6 ml-2"></div>
        </div>
        <div class="relative text-right">
          <p id="mult" class="inline-block rounded-full px-3 py-1 text-sm font-semibold bg-white/10 text-muted transition">×1</p>
          <p class="mt-2 text-sm text-muted">Score</p>
          <p id="gscore" class="text-3xl sm:text-4xl font-semibold tabular-nums">0</p>
          <div id="fx-score" class="absolute right-0 -top-6"></div>
        </div>
      </div>
      <div class="relative mt-4 h-3 rounded-full bg-white/10">
        <div id="tbar" class="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-flame via-amber to-amber-hi shadow-[0_0_18px_rgba(242,169,59,.7)]" style="width:100%"></div>
      </div>
      <p class="mt-2 text-sm text-faint tabular-nums">Best ${getBest().toLocaleString()}</p>
      <div id="gq" class="mt-8"></div>
    </section>`;

  nextClockQuestion();
  game.last = performance.now();
  game.raf = requestAnimationFrame(tick);
}

function tick(t) {
  if (!game || !game.running) return;
  // Cap each step so time spent in a background tab does not count.
  game.left -= Math.min(250, t - game.last);
  game.last = t;
  drawClock();
  if (game.left <= 0) return endClock();
  game.raf = requestAnimationFrame(tick);
}

function drawClock() {
  const s = Math.max(0, Math.ceil(game.left / 1000));
  const clock = $('clock');
  clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  clock.classList.toggle('text-bad', s <= 10);
  clock.classList.toggle('animate-pulse', s <= 10);
  $('tbar').style.width = `${Math.max(0, Math.min(100, game.left / CLOCK_MS * 100))}%`;
}

function popFx(id, text, cls) {
  const el = document.createElement('span');
  el.className = `absolute whitespace-nowrap font-semibold text-lg animate-float-up ${cls}`;
  el.textContent = text;
  $(id).appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function nextClockQuestion() {
  if (game.pos >= game.deck.length) { game.deck = shuffle(game.deck); game.pos = 0; }
  const q = questions[game.deck[game.pos]];
  const gq = $('gq');
  gq.setAttribute('style', partStyle(q.part));
  gq.innerHTML = questionMarkup(q, esc(q.part.num));
  [...gq.children].forEach((c, i) => rise(c, i * 0.5));
  gq.querySelectorAll('.opt').forEach(b => { b.onclick = () => answerClock(b.dataset.opt); });
  game.locked = false;
}

function answerClock(option) {
  if (!game || game.locked || !game.running) return;
  game.locked = true;
  const qi = game.deck[game.pos];
  const q = questions[qi];
  const right = option === q.answer;
  markOptions(q, option);

  if (right) {
    game.streak++;
    game.mult = Math.min(5, 1 + Math.floor(game.streak / 3));
    game.maxMult = Math.max(game.maxMult, game.mult);
    const pts = 100 * game.mult;
    game.score += pts;
    game.right++;
    game.left += 3000;
    popFx('fx-time', '+3s', 'text-amber');
    popFx('fx-score', `+${pts}`, 'text-amber');
  } else {
    game.streak = 0;
    game.mult = 1;
    game.wrong++;
    game.left -= 5000;
    game.missed.push({ i: qi, chosen: option });
    popFx('fx-time', '−5s', 'text-bad');
  }

  const gs = $('gscore');
  gs.textContent = game.score.toLocaleString();
  gs.classList.remove('animate-pop');
  void gs.offsetWidth;
  if (right) gs.classList.add('animate-pop');

  const m = $('mult');
  m.textContent = `×${game.mult}`;
  m.className = game.mult > 1
    ? 'inline-block rounded-full px-3 py-1 text-sm font-semibold text-ground bg-linear-to-r from-amber to-flame animate-glow transition'
    : 'inline-block rounded-full px-3 py-1 text-sm font-semibold bg-white/10 text-muted transition';

  drawClock();
  game.pos++;
  // A wrong answer stays on screen a little longer so the right one can be read.
  setTimeout(() => { if (game && game.running) nextClockQuestion(); }, right ? 450 : 1100);
}

function endClock() {
  game.running = false;
  cancelAnimationFrame(game.raf);
  const prev = getBest();
  const isBest = game.score > prev;
  if (isBest) setBest(game.score);
  const answered = game.right + game.wrong;
  const acc = answered ? Math.round(game.right / answered * 100) : 0;
  const seen = new Set();
  const missed = game.missed.filter(m => !seen.has(m.i) && seen.add(m.i));

  view.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <section>
        <h2 class="text-[32px] sm:text-[44px] leading-none font-semibold tracking-[-0.03em]">Time's up.</h2>
        <p class="mt-4 text-[88px] sm:text-[150px] leading-[0.9] font-semibold tracking-[-0.05em] tabular-nums pb-2
                  bg-linear-to-r from-amber via-amber-hi to-flame bg-[length:200%_auto] bg-clip-text text-transparent animate-shine"><span id="final">0</span></p>
        ${isBest
          ? `<p class="mt-2 inline-block rounded-full px-4 py-1.5 font-semibold text-ground bg-linear-to-r from-amber to-flame animate-glow">New best score!</p>`
          : `<p class="mt-2 text-lg text-muted tabular-nums">Your best is ${prev.toLocaleString()}</p>`}
      </section>

      <section class="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        ${[['Right', game.right], ['Wrong', game.wrong], ['Accuracy', `${acc}%`], ['Top multiplier', `×${game.maxMult}`]].map(([k, v]) => `
          <div class="rounded-xl border border-white/10 bg-white/[.04] backdrop-blur-sm px-4 py-4">
            <p class="text-sm text-muted">${k}</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums">${v}</p>
          </div>`).join('')}
      </section>

      <div class="mt-12 flex flex-col sm:flex-row gap-3">
        <button data-act="again" class="${BTN_PRIMARY}">Play again</button>
        <button data-act="home" class="${BTN_GHOST}">Back to start</button>
      </div>

      ${missed.length ? missedList(missed) : ''}
    </div>`;

  [...view.firstElementChild.children].forEach(rise);
  countUp($('final'), game.score);
  view.querySelector('[data-act="again"]').onclick = startClock;
  view.querySelector('[data-act="home"]').onclick = renderStart;
}

// ---------- Keyboard: 1-4 or A-D to answer, Enter for next ----------
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const next = $('next');
  const inReview = mode === 'review' && !!next;
  const inClock = mode === 'clock' && game && game.running;
  if (!inReview && !inClock) return;
  const opts = [...view.querySelectorAll('.opt')];
  const k = e.key.toLowerCase();
  let i = '123456'.indexOf(k);
  if (i < 0) i = 'abcdef'.indexOf(k);
  if (i >= 0 && opts[i] && !opts[i].disabled) { opts[i].click(); return; }
  if (inReview && (k === 'enter' || k === 'arrowright') && !next.disabled && document.activeElement !== next) {
    e.preventDefault();
    next.click();
  }
});

$('home').onclick = renderStart;

renderStart();
