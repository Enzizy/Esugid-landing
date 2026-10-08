/* E-sugid showcase — presentation controller (classic script; works from file:// too).
   Owns: chapters/beats, scroll mapping, keyboard & clicker navigation, steppers,
   defense mode (HUD, timer, notes, presenter window), dialogs, motion modes.
   The 3D world (world.js) only listens to the events dispatched here. */
(function () {
  'use strict';

  var doc = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var CONTENT = window.ESUGID_CONTENT || { screens: {}, chat: {} };
  var SCREENS = window.ESUGID_SCREENS || {};
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var fmt = function (s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  var emit = function (name, detail) { window.dispatchEvent(new CustomEvent(name, { detail: detail })); };

  /* ------------------------------------------------------------ model */
  var chapters = $$('.chapter').map(function (el, i) {
    var beats = $$('.beat', el);
    el.style.setProperty('--beats', String(beats.length));
    var notesTpl = $('template.ch-notes', el);
    return {
      i: i, el: el, id: el.id, title: el.dataset.title, short: el.dataset.short || el.dataset.title,
      time: +el.dataset.time || 60, beats: beats,
      notes: notesTpl ? notesTpl.innerHTML.trim() : ''
    };
  });
  var totalTime = chapters.reduce(function (s, c) { return s + c.time; }, 0);
  var planEnd = []; chapters.reduce(function (s, c, i) { planEnd[i] = s + c.time; return planEnd[i]; }, 0);
  var byId = {}; chapters.forEach(function (c) { byId[c.id] = c; });

  var state = { chapter: 0, beat: 0, progress: 0, chapterProgress: 0, shot: 'hero', mode: doc.dataset.motion, scrolly: false, present: false };
  window.ESUGID = { state: state, chapters: chapters };

  /* ------------------------------------------------------------ steppers (sub-steps inside a beat) */
  var steppers = {};
  $$('[data-stepper]').forEach(function (el) {
    var name = el.dataset.stepper;
    var buttons = $$('[data-step]', el);
    var st = {
      name: name, el: el, buttons: buttons, values: buttons.map(function (b) { return b.dataset.step; }),
      index: -1, start: name === 'chat' ? -1 : 0, beat: el.closest('.beat'),
      set: function (i, opts) { setStep(st, i, opts); }
    };
    steppers[name] = st;
    buttons.forEach(function (b, i) { b.addEventListener('click', function () { st.set(i, { user: true }); }); });
    st.set(st.start, { silent: true });
  });
  $$('[data-route-hs]').forEach(function (b) {
    b.addEventListener('click', function () { var st = steppers.route; st.set(st.values.indexOf(b.dataset.routeHs), { user: true }); });
  });

  function setStep(st, i, opts) {
    opts = opts || {};
    i = clamp(i, -1, st.values.length - 1);
    var prevIndex = st.index;
    st.index = i;
    var value = i >= 0 ? st.values[i] : null;
    st.buttons.forEach(function (b, k) {
      b.classList.toggle('is-on', k === i);
      b.classList.toggle('is-past', k < i);
      b.setAttribute('aria-selected', k === i ? 'true' : 'false');
    });
    $$('[data-panels="' + st.name + '"] > [data-panel], [data-step-screen="' + st.name + '"] [data-panel]').forEach(function (p) {
      p.classList.toggle('is-on', p.dataset.panel === value);
    });
    $$('[data-scope-hs]').forEach(function (h) { if (st.name === 'scope') h.classList.toggle('is-on', h.dataset.scopeHs === value); });
    if (st.name === 'chat' && i > prevIndex && i >= 0) chatAsk(st, prevIndex, i, opts);
    if (st.name === 'chat' && i < prevIndex) chatRebuild(i);
    if (st.name === 'flow') archFlow(value);
    var screenFig = $('[data-step-screen="' + st.name + '"]');
    if (screenFig) {
      var on = $('img.is-on[data-screen]', screenFig);
      if (on) screenFig.dataset.screen = on.dataset.screen;
    }
    if (!opts.silent) emit('esugid:step', { name: st.name, value: value, index: i, user: !!opts.user });
    if (opts.user) syncPresenter();
  }
  function activeStepper() {
    var beatEl = currentBeatEl();
    if (!beatEl) return null;
    for (var k in steppers) if (steppers[k].beat === beatEl) return steppers[k];
    return null;
  }
  function resetSteppersFor(beatEl, toEnd) {
    for (var k in steppers) {
      var st = steppers[k];
      if (st.beat !== beatEl) continue;
      st.set(toEnd ? st.values.length - 1 : st.start, { silent: false });
    }
  }

  /* ------------------------------------------------------------ assistant replay */
  var chatLog = $('[data-chat-log]');
  // Each rebuild starts a new "generation"; timers from an older generation do nothing.
  var chatGen = 0;
  function chatMessage(key, instant) {
    var c = CONTENT.chat[key]; if (!c || !chatLog) return;
    var gen = chatGen;
    var q = document.createElement('div'); q.className = 'msg-q'; q.textContent = c.q; chatLog.appendChild(q);
    var a = document.createElement('div'); a.className = 'msg-a';
    a.innerHTML = '<span class="who"><svg><use href="#i-sparkles"/></svg>E-SUGID AI</span><span class="txt"></span>';
    var txt = a.querySelector('.txt');
    chatLog.appendChild(a);
    var finish = function () {
      txt.textContent = c.a; txt.classList.remove('typing');
      if (c.action) {
        var btn = document.createElement('button'); btn.type = 'button';
        btn.innerHTML = c.action + ' <svg><use href="#i-arrow-right"/></svg>';
        btn.addEventListener('click', function () { toast('Opening “' + c.action.replace('Open ', '') + '” — press G to come back'); goTo(c.go[0], c.go[1]); });
        a.appendChild(btn);
      }
      var src = document.createElement('span'); src.className = 'src'; src.textContent = c.src; a.appendChild(src);
      chatLog.scrollTop = chatLog.scrollHeight;
    };
    if (instant || state.mode !== 'full') { finish(); return; }
    txt.classList.add('typing');
    var n = 0, words = c.a.split(' ');
    var type = function () {
      if (gen !== chatGen) return;
      n++; txt.textContent = words.slice(0, n).join(' ');
      chatLog.scrollTop = chatLog.scrollHeight;
      if (n >= words.length) finish(); else setTimeout(type, 50);
    };
    setTimeout(type, 420);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function chatAsk(st, from, to, opts) {
    // finish any message still typing (instantly), then add the new ones
    chatRebuild(from);
    for (var k = from + 1; k <= to; k++) chatMessage(st.values[k], k < to || opts.silent);
  }
  function chatRebuild(upto) {
    if (!chatLog) return;
    chatGen++;
    chatLog.innerHTML = '';
    var st = steppers.chat;
    for (var k = 0; k <= upto; k++) chatMessage(st.values[k], true);
  }

  /* ------------------------------------------------------------ architecture diagram wiring */
  var arch = $('[data-arch]');
  var FLOWS = {
    concern: [['app', 'fn'], ['fn', 'db'], ['db', 'web'], ['web', 'db'], ['db', 'app'], ['fn', 'fcm'], ['fcm', 'app']],
    announce: [['web', 'db'], ['db', 'fn'], ['fn', 'fcm'], ['fcm', 'app'], ['db', 'app']],
    alert: [['web', 'fn'], ['fn', 'db'], ['fn', 'fcm'], ['fcm', 'app'], ['app', 'fn']],
    assist: [['app', 'fn'], ['fn', 'db'], ['fn', 'gemini']]
  };
  function archDraw(flow) {
    if (!arch) return;
    var svg = $('.arch-wires', arch); var box = arch.getBoundingClientRect();
    if (!box.width) return;
    var rect = function (n) { var r = $('[data-n="' + n + '"]', arch).getBoundingClientRect(); return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top, cx: r.left - box.left + r.width / 2, cy: r.top - box.top + r.height / 2 }; };
    var seen = {}, html = '', k = 0;
    (FLOWS[flow] || []).forEach(function (p) {
      var a = rect(p[0]), b = rect(p[1]), d;
      var pairKey = [p[0], p[1]].sort().join('|'), lane = seen[pairKey] ? 10 : -6; seen[pairKey] = true;
      if (a.r < b.l || b.r < a.l) {
        // different columns: leave from the facing edges
        var x1 = a.r < b.l ? a.r : a.l, x2 = a.r < b.l ? b.l : b.r, y1 = a.cy + lane, y2 = b.cy + lane, mx = (x1 + x2) / 2;
        d = 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2;
        html += '<path class="is-lit" d="' + d + '"/><circle r="4.5" cx="' + x2 + '" cy="' + y2 + '"/>';
      } else {
        // same column: loop around the right-hand edge
        var bulge = 34 + (lane > 0 ? 18 : 0), xa = a.r, xb = b.r;
        d = 'M' + xa + ',' + (a.cy + lane) + ' C' + (xa + bulge) + ',' + (a.cy + lane) + ' ' + (xb + bulge) + ',' + (b.cy + lane) + ' ' + xb + ',' + (b.cy + lane);
        html += '<path class="is-lit" d="' + d + '"/><circle r="4.5" cx="' + xb + '" cy="' + (b.cy + lane) + '"/>';
      }
      k++;
    });
    svg.innerHTML = html;
    $$('.arch-node', arch).forEach(function (n) {
      var id = n.dataset.n; var used = (FLOWS[flow] || []).some(function (p) { return p[0] === id || p[1] === id; });
      n.classList.toggle('is-lit', used);
    });
  }
  function archFlow(flow) { if (!arch) return; arch.dataset.flow = flow || ''; requestAnimationFrame(function () { archDraw(flow); }); }

  /* ------------------------------------------------------------ layout mode */
  function wantScrolly() { return state.mode !== 'static' && innerWidth >= 900 && innerHeight >= 520; }
  function applyLayout(keepPosition) {
    var keep = keepPosition ? { c: state.chapter, b: state.beat } : null;
    state.scrolly = wantScrolly();
    doc.classList.toggle('scrolly', state.scrolly);
    doc.classList.toggle('calm-world', !state.scrolly && state.mode !== 'static');
    measure();
    if (keep) jump(keep.c, keep.b);
    onScroll();
  }
  var tops = [], beatLen = 0;
  function measure() {
    var y = scrollY;
    tops = chapters.map(function (c) { return c.el.getBoundingClientRect().top + y; });
    beatLen = state.scrolly ? (chapters[1].el.offsetHeight - innerHeight) / chapters[1].beats.length : 0;
    if (arch && state.chapter === byId.architecture.i) archDraw(arch.dataset.flow);
  }
  function beatScrollTarget(ci, bi) {
    var c = chapters[ci];
    if (state.scrolly) {
      var len = (c.el.offsetHeight - innerHeight) / c.beats.length;
      return Math.round(tops[ci] + (bi + 0.5) * len);
    }
    var el = bi === 0 ? c.el : c.beats[bi];
    return Math.max(0, Math.round(el.getBoundingClientRect().top + scrollY - (bi === 0 ? 0 : parseFloat(getComputedStyle(doc).getPropertyValue('--topbar')) + 12)));
  }

  /* ------------------------------------------------------------ scroll → state */
  var ticking = false;
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  function onScroll() {
    ticking = false;
    var y = scrollY, vh = innerHeight, ci = 0, bi = 0, prog = 0;
    if (state.scrolly) {
      var mid = y + vh * 0.5;
      for (var i = 0; i < chapters.length; i++) if (tops[i] <= mid) ci = i;
      // the chapter whose sticky stage covers the viewport centre
      var c = chapters[ci], local = y - tops[ci], len = (c.el.offsetHeight - vh) / c.beats.length;
      bi = clamp(Math.floor(local / len), 0, c.beats.length - 1);
      prog = clamp(local / (c.el.offsetHeight - vh), 0, 1);
    } else {
      var probe = y + vh * 0.42;
      for (var j = 0; j < chapters.length; j++) if (tops[j] <= probe) ci = j;
      var cc = chapters[ci];
      cc.beats.forEach(function (b, k) { if (b.getBoundingClientRect().top + y <= probe) bi = k; });
      prog = clamp((y - tops[ci]) / Math.max(1, cc.el.offsetHeight - vh), 0, 1);
    }
    state.chapterProgress = prog;
    var docMax = Math.max(1, doc.scrollHeight - vh);
    state.progress = y / docMax;
    setActive(ci, bi);
    // rail fill
    chapters.forEach(function (ch, k) {
      var seg = railSegs[k]; if (!seg) return;
      seg.classList.toggle('is-done', k < ci);
      seg.style.setProperty('--p', k === ci ? prog.toFixed(3) : (k < ci ? '1' : '0'));
    });
  }
  var lastBeatEl = null, navDirection = 1;
  function currentBeatEl() { var c = chapters[state.chapter]; return c && c.beats[state.beat]; }
  function setActive(ci, bi) {
    var changedChapter = ci !== state.chapter;
    var beatEl = chapters[ci].beats[bi];
    if (beatEl === lastBeatEl) return;
    var forward = lastBeatEl ? (ci > state.chapter || (ci === state.chapter && bi > state.beat)) : true;
    if (lastBeatEl) lastBeatEl.classList.remove('is-active');
    // every chapter keeps one active beat so stages never appear empty while sliding
    chapters.forEach(function (c, k) {
      if (k === ci) return;
      var want = k < ci ? c.beats.length - 1 : 0;
      c.beats.forEach(function (b, n) { b.classList.toggle('is-active', n === want); });
    });
    chapters[ci].beats.forEach(function (b, n) { b.classList.toggle('is-active', n === bi); });
    lastBeatEl = beatEl;
    state.chapter = ci; state.beat = bi; state.shot = beatEl.dataset.shot || chapters[ci].id;
    resetSteppersFor(beatEl, !forward && navDirection < 0);
    navDirection = 1;
    doc.dataset.chapter = chapters[ci].id;
    doc.style.setProperty('--scrim', chapters[ci].id === 'opening' ? '0' : '1');
    if (changedChapter) {
      if (history.replaceState) history.replaceState(null, '', '#' + chapters[ci].id);
      if (chapters[ci].id === 'architecture') requestAnimationFrame(function () { measure(); archDraw(arch && arch.dataset.flow); });
    }
    updateHud(); updateNotes(); syncPresenter();
    emit('esugid:state', { chapter: chapters[ci].id, beat: bi, shot: state.shot, forward: forward });
  }

  /* ------------------------------------------------------------ navigation */
  var tween = null, navTarget = null;
  function scrollToY(y, instant) {
    cancelTween();
    y = clamp(y, 0, doc.scrollHeight - innerHeight);
    var from = scrollY, dist = y - from;
    if (instant || state.mode !== 'full' || Math.abs(dist) < 2) { window.scrollTo(0, y); onScroll(); return; }
    var dur = clamp(520 + Math.abs(dist) * 0.22, 650, 1500), t0 = performance.now();
    var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    tween = { raf: 0 };
    var step = function (now) {
      var t = clamp((now - t0) / dur, 0, 1);
      window.scrollTo(0, from + dist * ease(t));
      if (t < 1) tween.raf = requestAnimationFrame(step); else tween = null;
    };
    tween.raf = requestAnimationFrame(step);
  }
  function cancelTween() { if (tween) { cancelAnimationFrame(tween.raf); tween = null; } }
  ['wheel', 'touchstart', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, function (e) { if (e.type !== 'mousedown' || e.target === doc) cancelTween(); }, { passive: true }); });

  function jump(ci, bi) { measure(); window.scrollTo(0, beatScrollTarget(ci, bi)); onScroll(); }
  function goTo(id, bi, opts) {
    var c = typeof id === 'number' ? chapters[id] : byId[id]; if (!c) return;
    bi = clamp(bi || 0, 0, c.beats.length - 1);
    measure();
    navDirection = (c.i < state.chapter || (c.i === state.chapter && bi < state.beat)) ? -1 : 1;
    if (opts && opts.fromEnd) navDirection = -1;
    navTarget = { c: c.i, b: bi };
    scrollToY(beatScrollTarget(c.i, bi), opts && opts.instant);
  }
  function here() { return tween && navTarget ? navTarget : { c: state.chapter, b: state.beat }; }
  function next() {
    var st = tween ? null : activeStepper();
    if (st && st.index < st.values.length - 1) { st.set(st.index + 1, { user: true }); return; }
    var h = here(), c = chapters[h.c];
    if (h.b < c.beats.length - 1) goTo(c.i, h.b + 1);
    else if (c.i < chapters.length - 1) goTo(c.i + 1, 0);
    else toast('End of presentation — questions welcome');
  }
  function prev() {
    var st = tween ? null : activeStepper();
    if (st && st.index > st.start) { st.set(st.index - 1, { user: true }); return; }
    var h = here(), c = chapters[h.c];
    if (h.b > 0) goTo(c.i, h.b - 1, { fromEnd: true });
    else if (c.i > 0) goTo(c.i - 1, chapters[c.i - 1].beats.length - 1, { fromEnd: true });
  }
  window.ESUGID.goTo = goTo; window.ESUGID.next = next; window.ESUGID.prev = prev;
  window.ESUGID.isMoving = function () { return !!tween; };

  /* ------------------------------------------------------------ rail */
  var rail = $('#rail'), railSegs = [];
  chapters.forEach(function (c, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'rail-seg'; b.style.setProperty('--w', String(c.time));
    b.setAttribute('aria-label', (i ? String(i).padStart(2, '0') + ' ' : '') + c.title);
    b.innerHTML = '<i></i><span>' + (i ? String(i).padStart(2, '0') + ' · ' : '') + c.title + ' · ' + fmt(c.time) + '</span>';
    b.addEventListener('click', function () { goTo(i, 0); });
    rail.appendChild(b); railSegs.push(b);
  });

  /* ------------------------------------------------------------ defense mode, HUD, timer */
  var hud = $('#hud'), timerStart = 0, timerInt = null;
  function setPresent(on) {
    state.present = on;
    doc.dataset.present = on ? '1' : '';
    if (!on) delete doc.dataset.present;
    hud.hidden = !on;
    $('#btn-present').classList.toggle('is-on', on);
    $('#btn-present span').textContent = on ? 'Presenting' : 'Present';
    if (on && !timerStart) { timerStart = Date.now(); }
    clearInterval(timerInt);
    if (on) timerInt = setInterval(tick, 500);
    tick(); measureSoon(); updateHud(); syncPresenter();
  }
  function elapsed() { return timerStart ? (Date.now() - timerStart) / 1000 : 0; }
  function tick() {
    var e = elapsed();
    $('#hud-elapsed').textContent = fmt(e);
    $('#hud-plan').textContent = '/ ' + fmt(totalTime);
    var t = $('#hud-time');
    t.classList.toggle('is-behind', e > planEnd[state.chapter] + 20 && e <= totalTime);
    t.classList.toggle('is-over', e > totalTime);
    if (state.present) toPresenter({ type: 'tick', elapsed: e });
  }
  function updateHud() {
    var c = chapters[state.chapter];
    $('#hud-num').textContent = String(c.i).padStart(2, '0');
    $('#hud-chapter').textContent = c.title;
    var st = activeStepper();
    $('#hud-beat').textContent = (c.beats.length > 1 ? 'step ' + (state.beat + 1) + '/' + c.beats.length : '') + (st && st.index >= 0 ? ' · ' + (st.index + 1) + '/' + st.values.length : '');
    var done = chapters.slice(0, c.i).reduce(function (s, x) { return s + x.time; }, 0) + c.time * ((state.beat + 1) / c.beats.length);
    $('#hud-progress').style.width = (100 * done / totalTime).toFixed(1) + '%';
  }
  window.addEventListener('esugid:step', updateHud);

  /* ------------------------------------------------------------ notes */
  var notes = $('#notes');
  function updateNotes() {
    var c = chapters[state.chapter];
    $('#notes-title').textContent = (c.i ? String(c.i).padStart(2, '0') + ' · ' : '') + c.title;
    $('#notes-time').textContent = fmt(c.time) + ' · plan ends ' + fmt(planEnd[c.i]);
    $('#notes-body').innerHTML = c.notes;
  }
  function toggleNotes(force) { notes.hidden = force === undefined ? !notes.hidden : !force; updateNotes(); }

  /* ------------------------------------------------------------ presenter window (second screen) */
  var presenterChannel = null, presenterWin = null;
  try { presenterChannel = new BroadcastChannel('esugid-presenter'); } catch (e) {}
  // BroadcastChannel for http://; direct postMessage also reaches a window opened from file://
  function toPresenter(msg) {
    if (presenterChannel) try { presenterChannel.postMessage(msg); } catch (e) {}
    if (presenterWin && !presenterWin.closed) try { presenterWin.postMessage(msg, '*'); } catch (e) {}
  }
  function syncPresenter() {
    if (!presenterChannel && !(presenterWin && !presenterWin.closed)) return;
    var c = chapters[state.chapter], nxt;
    var st = activeStepper();
    if (st && st.index < st.values.length - 1) nxt = 'Sub-step: ' + (st.buttons[st.index + 1].textContent || '').trim();
    else if (state.beat < c.beats.length - 1) nxt = c.title + ' — step ' + (state.beat + 2);
    else nxt = chapters[c.i + 1] ? chapters[c.i + 1].title : 'End';
    var h3 = $('.copy h3', c.beats[state.beat]);
    toPresenter({
      type: 'state', chapter: c.i, beat: state.beat, beats: c.beats.length, title: c.title, heading: h3 ? h3.textContent : c.title,
      notes: c.notes, next: nxt, time: c.time, planEnd: planEnd[c.i], total: totalTime, elapsed: elapsed(), present: state.present,
      list: chapters.map(function (x) { return { title: x.title, time: x.time }; })
    });
  }
  var seenCmd = {};
  function onPresenterMsg(e) {
    var m = e.data || {};
    if (m.id) { if (seenCmd[m.id]) return; seenCmd[m.id] = 1; }   // the same command can arrive by two routes
    if (m.type === 'cmd') {
      if (m.cmd === 'next') next(); else if (m.cmd === 'prev') prev();
      else if (m.cmd === 'goto') goTo(m.chapter, m.beat || 0);
      else if (m.cmd === 'reset') { timerStart = Date.now(); tick(); }
      else if (m.cmd === 'black') toggleBlackout();
      else if (m.cmd === 'hello') syncPresenter();
    }
  }
  if (presenterChannel) presenterChannel.onmessage = onPresenterMsg;
  window.addEventListener('message', function (e) { if (presenterWin && e.source === presenterWin) onPresenterMsg(e); });
  function openPresenter() {
    presenterWin = window.open('presenter.html', 'esugid-presenter', 'width=980,height=720');
    if (!presenterWin) toast('Allow pop-ups to open the presenter window');
    if (!state.present) setPresent(true);
    setTimeout(syncPresenter, 600);
  }

  /* ------------------------------------------------------------ motion modes */
  var MODES = ['full', 'calm', 'static'];
  var LABELS = { full: 'Full motion', calm: 'Calm', static: 'Static' };
  function setMode(m, quiet) {
    state.mode = m; doc.dataset.motion = m; store.set('esugid.motion', m);
    $('#motion-label').textContent = LABELS[m];
    $('#btn-motion').title = 'Motion: ' + LABELS[m] + ' (M to change)';
    applyLayout(true);
    emit('esugid:motion', { mode: m });
    if (!quiet) toast(m === 'full' ? 'Full motion — 3D and scroll storytelling' : m === 'calm' ? 'Calm — 3D holds still, no camera travel' : 'Static — no 3D, every step in order');
  }

  /* ------------------------------------------------------------ dialogs */
  function openDialog(d) { $$('dialog[open]').forEach(function (x) { if (x !== d && !(d === dlgShotRef() && x.id === 'dlg-library')) x.close(); }); if (!d.open) d.showModal(); }
  function dlgShotRef() { return document.getElementById('dlg-shot'); }
  $$('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d && !d.classList.contains('lightbox')) d.close(); if (e.target.closest('[data-close]')) d.close(); });
  });
  // chapter list
  var dlgChapters = $('#dlg-chapters');
  function openChapters() {
    var list = $('#chapter-list'); list.innerHTML = '';
    chapters.forEach(function (c, i) {
      var li = document.createElement('li');
      li.innerHTML = '<button type="button"><span class="cl-num">' + String(i).padStart(2, '0') + '</span><span class="cl-title">' + c.title + '</span><span class="cl-beats">' + c.beats.length + (c.beats.length > 1 ? ' steps' : ' step') + '</span><span class="cl-time">' + fmt(c.time) + '</span></button>';
      var b = li.firstChild; b.classList.toggle('is-current', i === state.chapter);
      b.addEventListener('click', function () { dlgChapters.close(); goTo(i, 0); });
      list.appendChild(li);
    });
    $('#chapters-total').textContent = chapters.length + ' chapters · planned ' + fmt(totalTime);
    openDialog(dlgChapters);
    var cur = $('.is-current', list); if (cur) cur.focus();
  }
  // library
  var dlgLib = $('#dlg-library'), libBuilt = false, libFilter = 'all';
  var ORDER = Object.keys(CONTENT.screens).filter(function (k) { return SCREENS[k]; });
  function buildLibrary() {
    var grid = $('#lib-grid');
    ORDER.forEach(function (k) {
      var s = SCREENS[k], info = CONTENT.screens[k];
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'lib-item lib-item--' + s.group; b.dataset.key = k; b.dataset.group = s.group;
      b.dataset.text = (info.title + ' ' + info.who + ' ' + info.desc).toLowerCase();
      b.innerHTML = '<img src="' + (s.thumb || s.src) + '" alt="" loading="lazy"><span>' + info.who.split(' · ')[0] + '</span><b>' + info.title + '</b>';
      b.addEventListener('click', function () { openShot(k, ORDER); });
      grid.appendChild(b);
    });
    libBuilt = true;
  }
  function filterLibrary() {
    var q = ($('#lib-q').value || '').trim().toLowerCase();
    $$('.lib-item').forEach(function (it) { it.hidden = !((libFilter === 'all' || it.dataset.group === libFilter) && (!q || it.dataset.text.indexOf(q) >= 0)); });
  }
  $$('.lib-filters [data-filter]').forEach(function (b) {
    b.addEventListener('click', function () { libFilter = b.dataset.filter; $$('.lib-filters .chip').forEach(function (x) { x.classList.toggle('is-on', x === b); }); filterLibrary(); });
  });
  $('#lib-q').addEventListener('input', filterLibrary);
  function openLibrary() { if (!libBuilt) buildLibrary(); openDialog(dlgLib); }
  // lightbox
  var dlgShot = $('#dlg-shot'), shotList = [], shotIdx = 0;
  function openShot(key, list) {
    shotList = list && list.length ? list : [key]; shotIdx = Math.max(0, shotList.indexOf(key));
    renderShot(); openDialog(dlgShot);
  }
  function renderShot() {
    var k = shotList[shotIdx], s = SCREENS[k] || {}, info = CONTENT.screens[k] || {};
    dlgShot.classList.remove('is-zoomed');
    var img = $('#shot-img'); img.src = s.src; img.alt = info.title || '';
    $('#shot-who').textContent = info.who || '';
    $('#shot-title').textContent = info.title || '';
    $('#shot-desc').textContent = info.desc || '';
    var note = $('#shot-note'); note.hidden = !info.note; note.innerHTML = info.note ? '<svg><use href="#i-info"/></svg><span>' + info.note + '</span>' : '';
    $('#shot-src').textContent = 'Actual screenshot · unaltered · ' + (s.w || '') + '×' + (s.h || '') + ' · ' + (s.origin || '');
    $('[data-lb="prev"]', dlgShot).disabled = shotList.length < 2;
    $('[data-lb="next"]', dlgShot).disabled = shotList.length < 2;
  }
  $$('[data-lb]', dlgShot).forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.dataset.lb;
      if (a === 'prev') { shotIdx = (shotIdx - 1 + shotList.length) % shotList.length; renderShot(); }
      if (a === 'next') { shotIdx = (shotIdx + 1) % shotList.length; renderShot(); }
      if (a === 'zoom') dlgShot.classList.toggle('is-zoomed');
      if (a === 'goto') { var info = CONTENT.screens[shotList[shotIdx]]; dlgShot.close(); if (dlgLib.open) dlgLib.close(); if (info) goTo(info.chapter, info.beat); }
    });
  });
  $('#shot-img').addEventListener('click', function () { dlgShot.classList.toggle('is-zoomed'); });
  document.addEventListener('click', function (e) {
    var img = e.target.closest('.phone-screen img, .browser-screen img');
    if (!img) return;
    var key = img.dataset.screen || (img.closest('[data-screen]') || {}).dataset && img.closest('[data-screen]').dataset.screen;
    if (!key) return;
    var chapterEl = img.closest('.chapter');
    var keys = [];
    $$('[data-screen]', chapterEl).forEach(function (n) { var k = n.dataset.screen; if (SCREENS[k] && keys.indexOf(k) < 0) keys.push(k); });
    openShot(key, keys);
  });
  var dlgHelp = $('#dlg-help');

  /* ------------------------------------------------------------ hotspot list ↔ dots */
  $$('.hs-list li[data-hs]').forEach(function (li) {
    var beat = li.closest('.beat');
    var dot = function () { return $$('.hs', beat).filter(function (h) { return h.textContent.trim() === li.dataset.hs; })[0]; };
    li.addEventListener('mouseenter', function () { var d = dot(); if (d) d.classList.add('is-hot'); li.classList.add('is-hot'); });
    li.addEventListener('mouseleave', function () { var d = dot(); if (d) d.classList.remove('is-hot'); li.classList.remove('is-hot'); });
  });

  /* ------------------------------------------------------------ misc UI */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  window.ESUGID.toast = toast;
  var blackout = $('#blackout');
  function toggleBlackout() { blackout.hidden = !blackout.hidden; }
  blackout.addEventListener('click', toggleBlackout);
  function toggleFullscreen() {
    if (!document.fullscreenElement) { (doc.requestFullscreen ? doc.requestFullscreen() : Promise.reject()).catch(function () { toast('Fullscreen is not available here — try F11'); }); }
    else document.exitFullscreen();
  }
  var measureSoon = function () { setTimeout(function () { measure(); onScroll(); }, 60); };

  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); $$('dialog[open]').forEach(function (d) { d.close(); }); goTo(go.dataset.go, +(go.dataset.beat || 0)); return; }
    var act = e.target.closest('[data-action]');
    if (!act) return;
    var a = act.dataset.action;
    if (a === 'begin') { setPresent(true); goTo('problem', 0); }
    else if (a === 'next') next();
    else if (a === 'prev') prev();
    else if (a === 'notes') toggleNotes();
    else if (a === 'library') openLibrary();
  });
  $('#btn-present').addEventListener('click', function () { setPresent(!state.present); });
  $('#btn-chapters').addEventListener('click', openChapters);
  $('#btn-library').addEventListener('click', openLibrary);
  $('#btn-motion').addEventListener('click', function () { setMode(MODES[(MODES.indexOf(state.mode) + 1) % MODES.length]); });

  /* ------------------------------------------------------------ keyboard & clicker */
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable) return;
    var k = e.key;
    if (dlgShot.open) {
      if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); shotIdx = (shotIdx + 1) % shotList.length; renderShot(); }
      else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); shotIdx = (shotIdx - 1 + shotList.length) % shotList.length; renderShot(); }
      else if (k === 'z' || k === 'Z') dlgShot.classList.toggle('is-zoomed');
      return;
    }
    if ($$('dialog[open]').length) return;
    if (!blackout.hidden && k !== 'b' && k !== 'B' && k !== '.') { toggleBlackout(); e.preventDefault(); return; }
    var onControl = tag === 'button' || tag === 'a' || tag === 'summary';
    var nextKeys = ['ArrowRight', 'PageDown'], prevKeys = ['ArrowLeft', 'PageUp'];
    if (state.present) { nextKeys.push('ArrowDown'); prevKeys.push('ArrowUp'); if (!onControl) nextKeys.push(' '); }
    if (nextKeys.indexOf(k) >= 0 && !(k === ' ' && e.shiftKey)) { e.preventDefault(); next(); return; }
    if (prevKeys.indexOf(k) >= 0 || (k === ' ' && e.shiftKey && state.present)) { e.preventDefault(); prev(); return; }
    if (k === 'Home') { e.preventDefault(); goTo(0, 0); return; }
    if (k === 'End') { e.preventDefault(); goTo(chapters.length - 1, 0); return; }
    if (/^[0-9]$/.test(k)) { var n = k === '0' ? 10 : +k; if (chapters[n]) goTo(n, 0); return; }
    switch (k.toLowerCase()) {
      case 'g': openChapters(); break;
      case 'l': openLibrary(); break;
      case 'n': toggleNotes(); break;
      case 'p': setPresent(!state.present); break;
      case 'w': openPresenter(); break;
      case 't': timerStart = Date.now(); tick(); toast('Timer reset'); break;
      case 'm': setMode(MODES[(MODES.indexOf(state.mode) + 1) % MODES.length]); break;
      case 'f': toggleFullscreen(); break;
      case 'b': case '.': toggleBlackout(); break;
      case '?': case 'h': openDialog(dlgHelp); break;
      default: return;
    }
    e.preventDefault();
  });

  /* ------------------------------------------------------------ idle cursor while presenting */
  var idleT;
  document.addEventListener('mousemove', function () {
    doc.classList.remove('cursor-idle'); clearTimeout(idleT);
    if (state.present) idleT = setTimeout(function () { doc.classList.add('cursor-idle'); }, 2500);
  });
  var cs = document.createElement('style'); cs.textContent = '.cursor-idle, .cursor-idle * { cursor: none !important; }'; document.head.appendChild(cs);

  /* ------------------------------------------------------------ boot */
  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      var was = state.scrolly;
      if (was !== wantScrolly()) applyLayout(true); else { var c = state.chapter, b = state.beat; measure(); if (state.scrolly) jump(c, b); else onScroll(); }
    }, 150);
  });
  window.addEventListener('load', measureSoon);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureSoon);

  $('#motion-label').textContent = LABELS[state.mode];
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  applyLayout(false);
  var startId = (location.hash || '').slice(1);
  if (byId[startId] && startId !== 'opening') jump(byId[startId].i, 0); else window.scrollTo(0, 0);
  onScroll();
  if (doc.dataset.present === '1') setPresent(true); else hud.hidden = true;
  if (!state.present) delete doc.dataset.present;
  // Load remaining images once the first screen is up, so stepping never waits on a file.
  setTimeout(function () { $$('img[loading="lazy"]').forEach(function (img) { img.loading = 'eager'; }); }, 1500);
  emit('esugid:ready', { mode: state.mode });
})();
