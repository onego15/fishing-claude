/* Lumina Mere — DOM user interface (HUD, cards, journal, workshop) */
'use strict';

(function (LM) {
  const $ = (id) => document.getElementById(id);
  const ui = {};
  const G = LM.G;
  let hintTimer = 0, bannerTimer = null, catchCb = null, selectedDex = null;

  // sprite → data URL cache (scaled with CSS, pixelated)
  const urlCache = {};
  function fishURL(id) {
    if (!urlCache[id]) urlCache[id] = G.fishSprite(id).canvas.toDataURL();
    return urlCache[id];
  }

  ui.init = function () {
    $('btn-new').addEventListener('click', () => { LM.audio.init(); G.startGame(false); });
    $('btn-continue').addEventListener('click', () => { LM.audio.init(); G.startGame(true); });
    $('btn-continue').disabled = !G.hasSave();
    ui.titleSel = G.hasSave() ? 1 : 0;
    ui.markTitle();
    $('hb-dex').addEventListener('click', (e) => { e.stopPropagation(); ui.openDex(); });
    $('hb-shop').addEventListener('click', (e) => { e.stopPropagation(); ui.openShop(); });
    $('hb-rest').addEventListener('click', (e) => { e.stopPropagation(); G.rest(); });
    $('hb-sound').addEventListener('click', (e) => { e.stopPropagation(); ui.toggleSound(); });
    for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', (e) => { e.stopPropagation(); ui.closeModals(); });
    $('btn-free').addEventListener('click', (e) => { e.stopPropagation(); $('ending').classList.add('hidden'); G.menuOpen = false; G.setState('idle'); LM.audio.sfx('close'); });
    for (const m of ['dex', 'shop']) $(m).addEventListener('pointerdown', (e) => { if (e.target === $(m)) ui.closeModals(); e.stopPropagation(); });
    $('catch').addEventListener('pointerdown', (e) => { e.stopPropagation(); ui.dismissCatch(); });
    for (const el of document.querySelectorAll('.hud-tr, .modal')) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  };

  ui.markTitle = function () {
    $('btn-new').classList.toggle('sel', ui.titleSel === 0);
    $('btn-continue').classList.toggle('sel', ui.titleSel === 1);
  };

  ui.enterGame = function () {
    $('title').classList.add('fade');
    setTimeout(() => $('title').classList.add('hidden'), 1300);
    $('hud').classList.remove('hidden');
    ui.updateHud();
  };

  ui.toggleSound = function () {
    LM.audio.setMuted(!LM.audio.muted);
    $('hb-sound').classList.toggle('off', LM.audio.muted);
    ui.toast(LM.audio.muted ? '音をオフにした' : '音をオンにした');
  };

  // ----------------------------------------------------------- HUD
  ui.updateHud = function () {
    if (!G.save) return;
    const s = G.save;
    $('lumen').textContent = s.lumen;
    const n = G.speciesCount();
    const total = LM.FISH.filter((f) => !f.legend).length;
    $('dex-count').textContent = `${n}/${total}${s.legendDone ? ' ＋主' : ''}`;
    const need = LM.LEGEND_NEED;
    $('goal-fill').style.width = `${Math.min(1, n / need) * 100}%`;
    let note;
    if (s.legendDone) note = '湖の主を釣り上げた。図鑑の完成を目指そう。';
    else if (n < need) note = `あと${need - n}種を記録すると、湖の主の噂が…`;
    else if (s.up.lure < 2) note = '湖の主は「星灯りの擬餌」にしか応えないらしい。工房へ。';
    else note = '夜、いちばん遠くへ投げれば、湖の主が応える。';
    $('goal-note').textContent = note;
  };

  ui.updateClock = function () {
    const env = LM.env;
    $('clock-time').textContent = env.clockText();
    $('clock-period').textContent = env.period ? env.period.name : '';
    $('clock-weather').textContent = LM.WEATHER[env.weather].name;
    $('dial-hand').style.transform = `rotate(${(env.hour / 24) * 360 + 180}deg)`;
    const busy = G.state !== 'idle';
    $('hb-rest').disabled = busy;
  };

  ui.hint = function (text, sec) {
    const h = $('hint');
    h.textContent = text;
    h.classList.add('show');
    hintTimer = sec || 4;
  };

  ui.toast = function (text) {
    const box = $('toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3300);
  };

  ui.banner = function (title, sub) {
    $('b-title').textContent = title;
    $('b-sub').textContent = sub || '';
    const b = $('banner');
    b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), 3200);
  };

  ui.popupWorld = function (text, x, y, cls) {
    const p = G.worldToScreen(x, y);
    const el = document.createElement('div');
    el.className = 'pop ' + (cls || '');
    el.textContent = text;
    el.style.left = (p.x * 100) + '%';
    el.style.top = (p.y * 100) + '%';
    $('popups').appendChild(el);
    setTimeout(() => el.remove(), 1100);
  };

  ui.powerMeter = function (show, p) {
    const el = $('power');
    el.classList.toggle('hidden', !show);
    if (!show) return;
    const c = LM.World.charPos(G);
    const s = G.worldToScreen(c.x - 6, c.y + 6);
    el.style.left = (s.x * 100) + '%';
    el.style.top = (s.y * 100) + '%';
    $('power-fill').style.height = `calc(${p * 100}% - 0.36em)`;
  };

  ui.fightHud = function (show, f) {
    const el = $('fight');
    el.classList.toggle('hidden', !show);
    if (!show || !f) return;
    const known = !!G.save.species[f.fish.id];
    $('fight-name').textContent = known ? f.fish.name : '？？？';
    const v = LM.clamp(f.T / 100, 0, 1);
    const ten = el.querySelector('.tension');
    const mist = f.act === 'vanish';
    ten.classList.toggle('hot', v >= 0.8 && !mist);
    ten.classList.toggle('mist', mist);
    $('t-val').setAttribute('stroke-dasharray', `${(mist ? 1 : v) * 188.5} 251.3`);
    $('t-num').textContent = mist ? '？' : Math.round(v * 100);
    $('t-label').textContent = mist ? '霧で見えない' : 'テンション';
    const d = LM.clamp(f.D / 100, 0, 1);
    $('d-fill').style.width = `${d * 100}%`;
    $('d-fish').style.left = `${d * 100}%`;
    $('d-num').textContent = `${Math.max(0, Math.round(f.D * 0.3))}m`;
  };

  // ----------------------------------------------------------- catch card
  ui.showCatch = function (fish, size, reward, isNew, record, cb) {
    catchCb = cb;
    G.menuOpen = true;
    const sp = G.fishSprite(fish.id);
    const img = $('card-img');
    img.src = fishURL(fish.id);
    const scale = Math.min(6, Math.floor(260 / sp.w));
    img.style.width = `${(sp.w * scale) / 22}em`;
    $('card-name').textContent = fish.name;
    $('card-en').textContent = fish.en.toUpperCase();
    $('card-stars').textContent = '★'.repeat(fish.rarity) + '☆'.repeat(Math.max(0, 4 - fish.rarity));
    $('card-size').textContent = `${size}cm`;
    $('card-reward').textContent = `+${reward}`;
    $('card-desc').textContent = fish.desc;
    const badges = $('card-badges');
    badges.innerHTML = '';
    if (isNew) badges.insertAdjacentHTML('beforeend', '<span class="badge">NEW！図鑑登録</span>');
    if (record) badges.insertAdjacentHTML('beforeend', '<span class="badge rec">記録更新</span>');
    const m = $('catch');
    m.classList.remove('hidden');
    // restart animations
    const card = m.querySelector('.card');
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    ui.catchShownAt = G.real;
    ui.updateHud();
  };
  ui.dismissCatch = function () {
    if ($('catch').classList.contains('hidden')) return false;
    if (G.real - ui.catchShownAt < 0.7) return true;
    $('catch').classList.add('hidden');
    G.menuOpen = false;
    LM.audio.sfx('close');
    const cb = catchCb; catchCb = null;
    if (cb) cb();
    return true;
  };

  // ----------------------------------------------------------- journal
  const periodNames = { dawn: '夜明け', day: '昼', dusk: '夕暮れ', night: '夜' };
  ui.openDex = function () {
    if (!canOpenMenu()) return;
    G.menuOpen = true;
    LM.audio.sfx('open');
    const grid = $('dex-grid');
    grid.innerHTML = '';
    const list = LM.FISH;
    list.forEach((f, i) => {
      const known = !!G.save.species[f.id];
      const cell = document.createElement('div');
      cell.className = 'dex-cell' + (known ? '' : ' unknown') + (f.legend ? ' legend' : '');
      const sp = G.fishSprite(f.id);
      const sc = f.legend ? 2 : Math.max(1, Math.min(4, Math.floor(56 / sp.w)));
      cell.innerHTML = `<span class="no">No.${String(i + 1).padStart(2, '0')}</span><img src="${fishURL(f.id)}" style="width:${(sp.w * sc) / 22}em"><span class="nm">${known ? f.name : '？？？'}</span>`;
      cell.addEventListener('click', () => { selectedDex = f.id; renderDexDetail(); for (const c of grid.children) c.classList.remove('sel'); cell.classList.add('sel'); LM.audio.sfx('ui'); });
      if (f.id === selectedDex) cell.classList.add('sel');
      grid.appendChild(cell);
    });
    $('dex-sub').textContent = `記録 ${G.speciesCount()} / ${list.length - 1} 種${G.save.legendDone ? '・湖の主 記録済み' : ''}`;
    if (!selectedDex) selectedDex = LM.FISH[0].id;
    renderDexDetail();
    $('dex').classList.remove('hidden');
  };
  function renderDexDetail() {
    const f = LM.FISH_BY_ID[selectedDex];
    const rec = G.save.species[f.id];
    const el = $('dex-detail');
    const sp = G.fishSprite(f.id);
    const sc = Math.max(2, Math.min(6, Math.floor(200 / sp.w)));
    const per = f.periods.length === 4 ? 'いつでも' : f.periods.map((p) => periodNames[p]).join('・');
    const wea = f.weather.length === 3 ? 'どんな天気でも' : f.weather.map((w) => LM.WEATHER[w].name).join('・');
    const zone = f.zone.map((z) => ['近場', '中ほど', '遠く'][z]).join('・');
    const req = [f.rod ? `竿Lv${f.rod}以上` : '', f.lure ? `擬餌Lv${f.lure}以上` : ''].filter(Boolean).join('・');
    if (!rec) {
      el.innerHTML = `<h3>？？？</h3><div class="en">未記録</div><div class="big"><img src="${fishURL(f.id)}" style="width:${(sp.w * sc) / 22}em;filter:brightness(0) opacity(.5)"></div>
        <div class="rows"><div><span>時間</span>${per}</div><div><span>天気</span>${wea}</div><div><span>場所</span>${zone}</div>${req ? `<div><span>条件</span>${req}</div>` : ''}</div>
        <div class="trait">${f.legend ? `${LM.LEGEND_NEED}種を記録し、星灯りの擬餌で夜の遠投を…` : '湖のどこかで、あなたを待っている。'}</div>`;
      return;
    }
    el.innerHTML = `<h3>${f.name}</h3><div class="en">${f.en}　${'★'.repeat(f.rarity)}</div><div class="big"><img src="${fishURL(f.id)}" style="width:${(sp.w * sc) / 22}em"></div>
      <p>${f.desc}</p>
      <div class="rows"><div><span>最大記録</span>${rec.best}cm</div><div><span>釣った数</span>${rec.count}匹</div><div><span>時間</span>${per}</div><div><span>天気</span>${wea}</div><div><span>場所</span>${zone}</div></div>
      <div class="trait">◆ ${f.trait}</div>`;
  }

  // ----------------------------------------------------------- workshop
  const toolIcons = {};
  function toolIcon(kind) {
    if (toolIcons[kind]) return toolIcons[kind];
    const maps = {
      rod: ['.........w', '........wb', '.......b..', '......b...', '.....b....', '....b.....', '...b......', '..k.......', '.kk.......', 'kk........'],
      line: ['..wwww....', '.w....w...', 'w..ww..w..', 'w.w..w.w..', 'w.w..w.w..', 'w..ww..w..', '.w....w...', '..wwww.b..', '........b.', '.........b'],
      lure: ['....k.....', '....k.....', '...rrr....', '..rRrrr...', '..rrrrr...', '..wwwww...', '..wWwww...', '...www....', '....k.....', '....k.....'],
    };
    const pal = { w: '#f3ecdc', b: '#b07a4a', k: '#5a3424', r: '#e8463a', R: '#ff9a7a', W: '#ffffff' };
    toolIcons[kind] = LM.P.fromMap(maps[kind], pal).toDataURL();
    return toolIcons[kind];
  }
  ui.openShop = function () {
    if (!canOpenMenu()) return;
    G.menuOpen = true;
    LM.audio.sfx('open');
    renderShop();
    $('shop').classList.remove('hidden');
  };
  function renderShop() {
    $('shop-lumen').textContent = G.save.lumen;
    const list = $('shop-list');
    list.innerHTML = '';
    for (const key of ['rod', 'line', 'lure']) {
      const U = LM.UPGRADES[key];
      const lv = G.save.up[key];
      const cur = U.tiers[lv], next = U.tiers[lv + 1];
      const row = document.createElement('div');
      row.className = 'shop-item';
      const pips = U.tiers.map((_, i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('');
      row.innerHTML = `<img class="shop-icon" src="${toolIcon(key)}"><div class="shop-info"><div class="nm">${cur.name}<span class="lv">${U.name} Lv${lv + 1}</span></div><div class="ds">${next ? `次：${next.name} — ${U.desc}` : '最高の品だ。'}</div><div class="pips">${pips}</div></div>`;
      const btn = document.createElement('button');
      btn.className = 'buy' + (next ? '' : ' max');
      if (next) {
        btn.innerHTML = `<span class="lumen-ico"></span> ${next.cost}`;
        btn.disabled = G.save.lumen < next.cost;
        btn.addEventListener('click', () => {
          if (G.save.lumen < next.cost) { LM.audio.sfx('deny'); return; }
          G.save.lumen -= next.cost;
          G.save.up[key]++;
          G.writeSave();
          LM.audio.sfx('buy');
          ui.toast(`${next.name} を手に入れた！`);
          renderShop();
          ui.updateHud();
        });
      } else { btn.textContent = 'MAX'; btn.disabled = true; }
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  function canOpenMenu() {
    return G.save && (G.state === 'idle' || G.state === 'ending') && !G.menuOpen;
  }

  ui.closeModals = function () {
    let closed = false;
    for (const m of ['dex', 'shop']) if (!$(m).classList.contains('hidden')) { $(m).classList.add('hidden'); closed = true; }
    if (closed) { G.menuOpen = false; LM.audio.sfx('close'); }
    return closed;
  };

  // ----------------------------------------------------------- ending
  ui.showEnding = function () {
    const s = G.save;
    const min = Math.floor(s.playTime / 60), sec = Math.floor(s.playTime % 60);
    const big = s.biggest ? `${LM.FISH_BY_ID[s.biggest.id].name} ${s.biggest.size}cm` : '-';
    $('end-stats').innerHTML = `<div><span>プレイ時間</span><b>${min}分${String(sec).padStart(2, '0')}秒</b></div><div><span>記録した魚</span><b>${G.speciesCount() + (s.legendDone ? 1 : 0)}種</b></div><div><span>釣った数</span><b>${s.catches}匹</b></div><div><span>最大の魚</span><b>${big}</b></div>`;
    $('ending').classList.remove('hidden');
    G.menuOpen = true;
  };

  ui.tick = function (dt) {
    if (hintTimer > 0) {
      hintTimer -= dt;
      if (hintTimer <= 0) $('hint').classList.remove('show');
    }
    if (G.save) ui.updateClock();
  };

  LM.ui = ui;
})(window.LM);
