(() => {
  'use strict';
  const CFG = window.SITE_CONFIG || {};
  const { brands, items } = window.CATALOG;
  const byId = new Map(items.map((i) => [i.id, i]));
  const brandOf = new Map(brands.map((b) => [b.id, b]));
  const STORE = 'yxt-cart-2026aw';
  const $ = (s, r = document) => r.querySelector(s);
  const yen = (n) => '¥' + Math.round(n).toLocaleString('en-US');
  const twd = (n) => 'NT$' + Math.round(n).toLocaleString('en-US');
  const SHIP = Object.assign({ PER_KG: 205, SMALL_KG: 5, SMALL_FEE: 110 }, CFG.SHIPPING);
  const BATCH = CFG.BATCH || {};
  const closeAt = BATCH.CLOSE_AT ? new Date(BATCH.CLOSE_AT) : null;
  const isClosed = () => !!closeAt && Date.now() > closeAt.getTime();
  const boxShip = (it) => Math.ceil((it.weight / 1000) * SHIP.PER_KG);
  function shipping(grams) {
    if (!grams) return 0;
    const kg = grams / 1000;
    return Math.ceil(kg * SHIP.PER_KG) + (kg < SHIP.SMALL_KG ? SHIP.SMALL_FEE : 0);
  }
  const toTwd = (y, r) => Math.ceil(y * r); // 台幣貨款無條件進位到元
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',
  };

  // ── 狀態
  let cart = {};
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    for (const [id, q] of Object.entries(saved)) if (byId.has(id) && q > 0) cart[id] = q;
  } catch (e) { /* 無法讀取就從空的開始 */ }
  let customer = '';
  try { customer = localStorage.getItem(STORE + '-cust') || ''; } catch (e) {}
  let currency = 'JPY';
  try { if (localStorage.getItem(STORE + '-cur') === 'TWD') currency = 'TWD'; } catch (e) {}
  let fx = { state: CFG.ORDER_ENDPOINT ? 'loading' : 'none' }; // loading | ok | none
  let sending = false;
  let done = null;
  let submitError = '';
  let custError = '';

  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (e) {} };

  function setQty(id, q) {
    const it = byId.get(id);
    const prev = cart[id] || 0;
    q = Math.max(0, Math.min(999, Math.floor(q) || 0));
    if (!it) return;
    if (q) cart[id] = q; else delete cart[id];
    if (done) done = null;
    save();
    syncSteppers(id);
    renderBrandStates();
    renderOrder();
    renderBar(q !== prev);
  }

  function totals() {
    const perBrand = {};
    let cases = 0, yenSum = 0, grams = 0, noWeight = false;
    for (const [id, q] of Object.entries(cart)) {
      const it = byId.get(id);
      (perBrand[it.brand] ||= { cases: 0, yen: 0, lines: [] });
      perBrand[it.brand].cases += q;
      perBrand[it.brand].yen += q * it.casePrice;
      perBrand[it.brand].lines.push([it, q]);
      cases += q; yenSum += q * it.casePrice;
      if (it.weight) grams += q * it.weight; else noWeight = true;
    }
    const useTwd = currency === 'TWD' && fx.state === 'ok';
    return { perBrand, cases, yen: yenSum, grams, noWeight, ship: shipping(grams), twd: useTwd ? toTwd(yenSum, fx.rate) : null };
  }
  // 選台幣但匯率尚未取得時，顯示/送出都視為不可用
  const twdReady = () => currency !== 'TWD' || fx.state === 'ok';

  // ── 型錄
  function stepper(it) {
    return `<div class="step" data-step="${it.id}" data-on="0">
      <button type="button" class="step-minus" data-d="-1" aria-label="減少 ${esc(it.zh)} ${esc(it.label)}">${ICON.minus}</button>
      <input type="number" inputmode="numeric" min="0" max="999" value="0" aria-label="${esc(it.zh)} ${esc(it.label)} 箱數">
      <span class="step-unit" aria-hidden="true">箱</span>
      <button type="button" class="step-plus" data-d="1" aria-label="增加 ${esc(it.zh)} ${esc(it.label)}">${ICON.plus}<span>訂購</span></button>
    </div>`;
  }
  const perText = (it) => it.perLabel || `${it.per} ${it.series === 'kz-cake' ? '個' : '盒'}`;
  function priceHtml(it) {
    if (CFG.SHOW_PRICE === false) return '<div class="price"></div>';
    return `<div class="price"><b>${yen(it.casePrice)}</b>／箱<span>單價 ${yen(it.unit)}${it.retail ? '・上代 ' + yen(it.retail) : ''}</span></div>`;
  }
  function itemHtml(it, solo) {
    const meta = [`每箱 ${perText(it)}`];
    if (it.shelf) meta.push(`<span${it.shelf <= 60 ? ' class="warn"' : ''}>賞味 ${it.shelf} 日</span>`);
    if (it.weight) meta.push(`箱重 ${(it.weight / 1000).toFixed(1)} kg・運費約 ${twd(boxShip(it))}`);
    if (it.note) meta.push(`<span class="warn">${esc(it.note)}</span>`);
    return `<li class="item" data-item="${it.id}">
      <button type="button" class="item-img" data-open="${it.id}" aria-label="查看 ${esc(it.zh)} ${esc(it.label)}">
        <img src="${it.img}" alt="" width="${it.iw}" height="${it.ih}" loading="lazy" decoding="async">
      </button>
      <div class="item-head">${solo
        ? `<button type="button" class="item-name solo" data-open="${it.id}">${esc(it.label)}</button>`
        : `<button type="button" class="item-name" data-open="${it.id}">${esc(it.zh)}</button><span class="item-label">${esc(it.label)}</span>`}</div>
      <p class="item-jp">${solo ? '' : esc(it.jp)}${it.sku ? (solo ? '品番 ' : '・') + esc(it.sku) : ''}</p>
      <p class="item-meta">${meta.join('')}</p>
      <div class="item-buy">${priceHtml(it)}${stepper(it)}</div>
    </li>`;
  }
  function renderCatalog() {
    let html = '';
    for (const b of brands) {
      const list = items.filter((i) => i.brand === b.id);
      const groups = [];
      for (const it of list) {
        let g = groups.find((x) => x.key === it.series);
        if (!g) groups.push((g = { key: it.series, title: it.seriesTitle, items: [] }));
        g.items.push(it);
      }
      html += `<section class="brand" id="${b.id}" data-brand="${b.id}">
        <div class="brand-head">
          <h2>${esc(b.name)}<small>${esc(b.place)}・${list.length} 品項</small></h2>
          <div class="leaf-rule" aria-hidden="true"><svg><use href="#leaf"/></svg><svg><use href="#leaf"/></svg></div>
          <p class="brand-intro">${esc(b.intro)}</p>
          <div class="rule" data-rule="${b.id}"><span><strong>以箱為單位，1 箱即可訂購</strong></span><span class="rule-state"></span></div>
          ${b.extra ? `<p class="rule-extra">${esc(b.extra)}</p>` : ''}
        </div>
        ${groups.map((g) => {
          const d = g.items.find((i) => i.seriesDesc)?.seriesDesc || g.items.find((i) => i.desc)?.desc;
          const sameJp = g.items.every((i) => i.jp === g.items[0].jp);
          const solo = sameJp && g.items.every((i) => i.zh === g.items[0].zh);
          return `<div class="series" data-series="${g.key}">
            <h3>${esc(solo ? g.items[0].zh : g.title)}${sameJp ? `<small>${esc(g.items[0].jp)}</small>` : ''}</h3>
            ${d ? `<p class="series-desc">${esc(d)}</p>` : ''}
            <ul>${g.items.map((i) => itemHtml(i, solo)).join('')}</ul>
          </div>`;
        }).join('')}
      </section>`;
    }
    html += '<div class="empty" id="empty" hidden><b>找不到符合的商品</b><button type="button" class="link" id="clearQ">清除搜尋</button></div>';
    $('#catalog').innerHTML = html;
    $('#tabs').innerHTML = brands.map((b) => `<a class="tab" href="#${b.id}" data-tab="${b.id}">${esc(b.name)}<span class="tab-n num" data-tabn="${b.id}"></span></a>`).join('');
  }

  function syncSteppers(id) {
    const sel = id ? `[data-step="${id}"]` : '[data-step]';
    document.querySelectorAll(sel).forEach((el) => {
      const q = cart[el.dataset.step] || 0;
      el.dataset.on = q ? '1' : '0';
      const inp = $('input', el);
      if (document.activeElement !== inp || !q) inp.value = q;
    });
  }

  function renderBrandStates() {
    const t = totals();
    for (const b of brands) {
      const n = t.perBrand[b.id]?.cases || 0;
      $(`[data-tabn="${b.id}"]`).textContent = n || '';
      const rule = $(`[data-rule="${b.id}"]`);
      const state = $('.rule-state', rule);
      rule.dataset.state = n ? 'ok' : '';
      state.innerHTML = n ? `${ICON.check}已選 ${n} 箱` : '';
    }
  }

  // ── 訂單面板
  function renderOrder() {
    const body = $('#orderBody');
    if (done) { body.innerHTML = doneHtml(); return; }
    const t = totals();
    if (!t.cases) {
      body.innerHTML = '<p class="o-empty">還沒有選任何商品。在左側品項按「訂購」加入箱數。</p>';
      return;
    }
    const keepFocus = document.activeElement?.id === 'cust';
    let html = '';
    for (const b of brands) {
      const pb = t.perBrand[b.id];
      if (!pb) continue;
      html += `<div class="o-brand"><h3>${esc(b.name)}<span class="num">${pb.cases} 箱</span></h3>
        ${pb.lines.map(([it, q]) => `<div class="o-line">
          <div>${esc(it.zh)} ${esc(it.label)}<small>${it.sku ? esc(it.sku) + '・' : ''}${CFG.SHOW_PRICE === false ? '' : yen(it.casePrice) + '／箱・'}<button type="button" class="o-rm" data-rm="${it.id}">移除</button></small></div>
          <div class="q">${q} 箱${CFG.SHOW_PRICE === false ? '' : `<small>${yen(q * it.casePrice)}</small>`}</div>
        </div>`).join('')}</div>`;
    }
    const kg = (t.grams / 1000).toFixed(1);
    const small = t.grams && t.grams < SHIP.SMALL_KG * 1000;
    const showPrice = CFG.SHOW_PRICE !== false;
    const twdTotal = t.twd != null ? t.twd + t.ship : null;
    html += `<fieldset class="cur">
      <legend>付款幣別</legend>
      <label><input type="radio" name="cur" value="JPY" ${currency === 'JPY' ? 'checked' : ''}><span>日幣</span></label>
      <label><input type="radio" name="cur" value="TWD" ${currency === 'TWD' ? 'checked' : ''} ${fx.state === 'none' ? 'disabled' : ''}><span>台幣</span></label>
    </fieldset>
    <p class="fx">${fxText()}</p>
    <dl class="o-total">
      <dt>總箱數</dt><dd>${t.cases} 箱</dd>
      <dt>預估總重</dt><dd>約 ${kg} kg${t.noWeight ? '＋' : ''}</dd>
      ${showPrice && t.twd != null ? `<dt>日幣貨款</dt><dd>${yen(t.yen)}</dd><dt>台幣貨款</dt><dd>${twd(t.twd)}</dd>` : ''}
      <dt>預估運費</dt><dd>${t.grams ? twd(t.ship) : '待秤重'}</dd>
      ${showPrice ? (twdTotal != null
        ? `<dt class="big-l">預估台幣合計</dt><dd class="big">${twd(twdTotal)}</dd>`
        : `<dt class="big-l">日幣貨款</dt><dd class="big">${yen(t.yen)}</dd>`) : ''}
    </dl>
    <p class="o-note">運費每公斤 ${twd(SHIP.PER_KG)}${small ? `，未滿 ${SHIP.SMALL_KG} kg 加收 ${twd(SHIP.SMALL_FEE)}（已計入）` : `，未滿 ${SHIP.SMALL_KG} kg 加收 ${twd(SHIP.SMALL_FEE)}`}，以台幣支付，實際依到貨秤重。${t.noWeight ? '風美庵尚無箱重資料，未計入預估總重與運費。' : ''}</p>`;
    const closed = isClosed();
    const blocked = closed || !twdReady();
    html += `<p class="o-batch">${batchText()}</p>
    <form id="orderForm" novalidate>
      <div class="field">
        <label for="cust">客戶編號</label>
        <input id="cust" name="cust" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="20" value="${esc(customer)}" ${custError ? 'aria-invalid="true" aria-describedby="custErr"' : 'aria-describedby="custHelp"'}>
        ${custError ? `<p class="field-err" id="custErr" role="alert">${esc(custError)}</p>` : '<p class="field-help" id="custHelp">毓秀堂提供給您的編號。不確定的話請洽業務。</p>'}
      </div>
      <p class="o-terms">提醒：商品<b>無發票</b>、<b>無中文標籤</b>。</p>
      ${submitError ? `<p class="field-err" role="alert">${esc(submitError)}</p>` : ''}
      <button class="btn btn-main" type="submit" ${sending || blocked ? 'disabled' : ''}>${sending ? '<span class="spin"></span>送出中' : closed ? '本批已截止收單' : '送出訂單'}</button>
      ${!closed && !twdReady() ? '<p class="o-note">匯率尚未取得，請稍候或改選日幣付款。</p>' : ''}
      ${CFG.ORDER_ENDPOINT ? '' : '<p class="o-note">目前是測試模式，訂單不會真的送出。</p>'}
    </form>`;
    body.innerHTML = html;
    if (keepFocus) { const c = $('#cust'); c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
  }

  function fxText() {
    if (fx.state === 'ok') return `上海銀行日圓現金賣出 <b>${fx.rate}</b>${fx.time ? `（${esc(fx.time)}${fx.source === 'manual' ? '・人工更新' : ''}）` : ''}，選台幣時以送出當下匯率換算，無條件進位到元。`;
    if (fx.state === 'loading') return '正在取得上海銀行匯率…';
    return '目前無法取得匯率，暫時只接受日幣付款。';
  }
  function batchText() {
    if (!BATCH.CLOSE_TEXT) return '';
    return isClosed()
      ? `本批已於 ${esc(BATCH.CLOSE_TEXT)} 截止收單。`
      : `本批收單至 <b>${esc(BATCH.CLOSE_TEXT)}</b>${BATCH.ARRIVE_TEXT ? `，預計 <b>${esc(BATCH.ARRIVE_TEXT)}</b> 到貨` : ''}。`;
  }
  function payText(d) {
    if (CFG.SHOW_PRICE === false) return '';
    return d.currency === 'TWD' ? `台幣貨款 ${twd(d.twd)}（匯率 ${d.rate}，日幣 ${yen(d.yen)}）` : `日幣貨款 ${yen(d.yen)}`;
  }

  function doneHtml() {
    return `<div class="done">
      <div class="done-mark">${ICON.check}</div>
      <h3>訂單已送出</h3>
      <p>我們確認供貨後，會通知您${done.currency === 'TWD' ? '台幣' : '日幣'}貨款金額與付款方式。運費於到貨秤重後另行通知。</p>
      <div class="done-no">訂單編號<b>${esc(done.orderId)}</b>客戶編號 ${esc(done.customer)}・共 ${done.cases} 箱${CFG.SHOW_PRICE === false ? '' : '<br>' + esc(payText(done))}${done.ship ? `<br>預估運費 ${twd(done.ship)}` : ''}${BATCH.ARRIVE_TEXT ? `<br>預計 ${esc(BATCH.ARRIVE_TEXT)} 到貨` : ''}</div>
      <ul class="done-list">${done.lines.map((l) => `<li><span>${esc(l.name)}</span><span>${l.qty} 箱</span></li>`).join('')}</ul>
      <button class="btn btn-ghost" type="button" id="copyOrder">複製訂單內容</button>
      <button class="btn btn-ghost" type="button" id="newOrder">再下一張訂單</button>
    </div>`;
  }

  function renderBar(bump) {
    const t = totals();
    $('#barCases').textContent = `${t.cases} 箱`;
    $('#barYen').textContent = t.cases ? (CFG.SHOW_PRICE === false ? '已選購' : t.twd != null ? `台幣貨款 ${twd(t.twd)}` : `日幣貨款 ${yen(t.yen)}`) : '尚未選購';
    if (bump) { const el = $('.bar-sum'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }

  // ── 送出
  function makeOrderId() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `YX${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${Math.floor(Math.random() * 90 + 10)}`;
  }
  async function submit() {
    if (sending) return;
    if (isClosed()) { renderOrder(); renderMast(); return; }
    if (!twdReady()) return;
    const cust = customer.trim().toUpperCase();
    custError = !cust ? '請輸入客戶編號。' : !/^[A-Z0-9\-_]{2,20}$/.test(cust) ? '客戶編號只能是英文字母、數字或連字號。' : '';
    submitError = '';
    if (custError) { renderOrder(); $('#cust').focus(); return; }
    const t = totals();
    const lines = Object.entries(cart).map(([id, q]) => {
      const it = byId.get(id);
      return { brand: brandOf.get(it.brand).name, sku: it.sku || '', jan: it.jan, name: `${it.zh} ${it.label}`, jp: it.jp, qty: q, casePrice: it.casePrice, subtotal: q * it.casePrice };
    });
    const payload = {
      orderId: makeOrderId(), customer: cust, items: lines, totalCases: t.cases, totalYen: t.yen,
      currency, rate: currency === 'TWD' ? fx.rate : null, totalTwd: t.twd,
      estKg: Math.round(t.grams / 100) / 10, estShip: t.ship,
    };
    let result = {};
    sending = true; renderOrder();
    try {
      if (CFG.ORDER_ENDPOINT) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 25000);
        const res = await fetch(CFG.ORDER_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), signal: ctl.signal });
        clearTimeout(timer);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || '伺服器回報失敗');
        result = data;
      } else {
        await new Promise((r) => setTimeout(r, 700));
      }
      // 台幣金額以伺服器當下匯率為準（舊版腳本沒有回傳時沿用畫面上的數字）
      const rate = result.rate || payload.rate;
      done = {
        orderId: payload.orderId, customer: cust, cases: t.cases, yen: t.yen, lines, ship: t.ship,
        currency, rate, twd: currency === 'TWD' ? (result.totalTwd || toTwd(t.yen, rate)) : null,
      };
      try { localStorage.setItem(STORE + '-cust', cust); } catch (e) {}
      cart = {}; save(); syncSteppers(); renderBrandStates(); renderBar();
    } catch (e) {
      submitError = /匯率/.test(e.message || '') ? e.message : '訂單沒有送出成功，您選的商品都還在。請檢查網路後再按一次，或直接聯絡業務。';
    }
    sending = false; renderOrder();
    if (done) $('#orderBody').scrollTop = 0;
  }
  function orderText() {
    return [`毓秀堂訂單 ${done.orderId}`, `客戶編號：${done.customer}`, ...done.lines.map((l) => `・${l.brand}｜${l.name}${l.sku ? '（' + l.sku + '）' : ''} × ${l.qty} 箱`), `共 ${done.cases} 箱${CFG.SHOW_PRICE === false ? '' : '，' + payText(done)}`,
      done.ship ? `預估運費 ${twd(done.ship)}（實際依到貨秤重）` : '',
      BATCH.ARRIVE_TEXT ? `預計 ${BATCH.ARRIVE_TEXT} 到貨` : ''].filter(Boolean).join('\n');
  }

  // ── 商品詳情
  function openDetail(id) {
    const it = byId.get(id), b = brandOf.get(it.brand);
    const rows = [
      ['每箱入數', perText(it)],
      CFG.SHOW_PRICE === false ? null : ['每箱價格', `${yen(it.casePrice)}（單價 ${yen(it.unit)}）`],
      it.retail && CFG.SHOW_PRICE !== false ? ['日本上代', yen(it.retail)] : null,
      it.shelf ? ['賞味期限', `製造日起 ${it.shelf} 日`] : null,
      it.weight ? ['每箱重量', `${(it.weight / 1000).toFixed(2)} kg`] : null,
      it.weight ? ['每箱運費', `約 ${twd(boxShip(it))}（每公斤 ${twd(SHIP.PER_KG)}）`] : null,
      it.sku ? ['品番', it.sku] : null,
      ['JAN', it.jan],
    ].filter(Boolean);
    $('#detailBody').innerHTML = `<div class="d-img"><img src="${it.img}" alt="${esc(it.zh)} ${esc(it.label)}" width="${it.iw}" height="${it.ih}" style="width:${Math.min(it.iw * 1.6, 420)}px"></div>
      <div class="d-body">
        <p class="d-brand">${esc(b.name)}</p>
        <h2 id="detailTitle">${esc(it.zh)} ${esc(it.label)}</h2>
        <p class="d-jp">${esc(it.jp)}</p>
        ${it.desc ? `<p class="d-desc">${esc(it.desc)}</p>` : ''}
        ${it.contents ? `<p class="d-contents"><b>內容物</b>　${esc(it.contents)}</p>` : ''}
        ${it.note ? `<p class="d-note">${esc(it.note)}</p>` : ''}
        <dl class="d-spec">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="d-buy">${priceHtml(it)}${stepper(it)}</div>
      </div>`;
    syncSteppers(id);
    $('#detail').showModal();
  }

  // ── 搜尋
  function applySearch(q) {
    q = q.trim().toLowerCase();
    $('.search').classList.toggle('has-q', !!q);
    let any = false;
    document.querySelectorAll('.brand').forEach((sec) => {
      let brandAny = false;
      sec.querySelectorAll('.series').forEach((se) => {
        let seAny = false;
        se.querySelectorAll('.item').forEach((li) => {
          const it = byId.get(li.dataset.item);
          const hay = `${it.zh} ${it.jp} ${it.label} ${it.sku || ''} ${it.jan} ${it.seriesTitle} ${brandOf.get(it.brand).name}`.toLowerCase();
          const hit = !q || hay.includes(q);
          li.hidden = !hit; if (hit) seAny = true;
        });
        se.hidden = !seAny; if (seAny) brandAny = true;
      });
      sec.hidden = !brandAny; if (brandAny) any = true;
    });
    $('#empty').hidden = any;
  }

  // ── 抽屜（手機）
  const order = $('#order'), scrim = $('#scrim');
  let lastFocus = null;
  function openOrder() {
    lastFocus = document.activeElement;
    scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('on'));
    order.classList.add('open'); document.documentElement.style.overflow = 'hidden';
    $('#orderClose').focus();
  }
  function closeOrder() {
    scrim.classList.remove('on'); order.classList.remove('open'); document.documentElement.style.overflow = '';
    setTimeout(() => { scrim.hidden = true; }, 300);
    lastFocus?.focus?.();
  }
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 3200); }

  // ── 事件
  document.addEventListener('click', (e) => {
    const stepBtn = e.target.closest('.step button');
    if (stepBtn) { const id = stepBtn.closest('.step').dataset.step; setQty(id, (cart[id] || 0) + Number(stepBtn.dataset.d)); return; }
    const open = e.target.closest('[data-open]');
    if (open) { openDetail(open.dataset.open); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { setQty(rm.dataset.rm, 0); return; }
    if (e.target.closest('#clearQ')) { $('#q').value = ''; applySearch(''); return; }
    if (e.target.closest('#copyOrder')) {
      navigator.clipboard?.writeText(orderText()).then(() => toast('已複製訂單內容'), () => toast('無法複製，請手動截圖'));
      return;
    }
    if (e.target.closest('#newOrder')) { done = null; renderOrder(); if (order.classList.contains('open')) closeOrder(); return; }
    const tab = e.target.closest('.tab');
    if (tab && $('#q').value) { $('#q').value = ''; applySearch(''); }
  });
  document.addEventListener('change', (e) => {
    const inp = e.target.closest('.step input');
    if (inp) setQty(inp.closest('.step').dataset.step, Number(inp.value));
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'cust') { customer = e.target.value; if (custError) { custError = ''; } }
    if (e.target.id === 'q') applySearch(e.target.value);
    if (e.target.name === 'cur') {
      currency = e.target.value === 'TWD' ? 'TWD' : 'JPY';
      try { localStorage.setItem(STORE + '-cur', currency); } catch (err) {}
      renderOrder(); renderBar();
      $(`input[name="cur"][value="${currency}"]`)?.focus();
    }
  });
  document.addEventListener('submit', (e) => { if (e.target.id === 'orderForm') { e.preventDefault(); submit(); } });
  $('#barOpen').addEventListener('click', openOrder);
  $('#orderClose').addEventListener('click', closeOrder);
  scrim.addEventListener('click', closeOrder);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && order.classList.contains('open')) closeOrder(); });
  $('#detailClose').addEventListener('click', () => $('#detail').close());
  $('#detail').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  // 捲動時標示目前品牌
  function spy() {
    const y = window.scrollY + 140;
    let cur = null;
    document.querySelectorAll('.brand:not([hidden])').forEach((s) => { if (s.offsetTop <= y) cur = s.id; });
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === cur;
      if (on && t.getAttribute('aria-current') !== 'true') {
        // 只橫向捲動目錄列本身；用 scrollIntoView 會打斷頁面正在進行的捲動
        const list = t.closest('.tabs-list');
        if (list) {
          const lr = list.getBoundingClientRect(), tr = t.getBoundingClientRect();
          list.scrollTo({ left: list.scrollLeft + tr.left - lr.left - (lr.width - tr.width) / 2, behavior: 'auto' });
        }
      }
      t.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }
  let ticking = false;
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { spy(); ticking = false; }); } }, { passive: true });

  // ── 收單期間與匯率
  function renderMast() {
    const el = $('#batch');
    if (!el) return;
    el.hidden = !BATCH.CLOSE_TEXT;
    el.dataset.closed = isClosed() ? '1' : '0';
    el.innerHTML = batchText();
  }
  async function loadRate() {
    if (!CFG.ORDER_ENDPOINT) return;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(CFG.ORDER_ENDPOINT + '?action=rate', { signal: ctl.signal });
      clearTimeout(timer);
      const d = await res.json();
      const r = Number(d.rate);
      fx = d.ok && r > 0.1 && r < 0.5 ? { state: 'ok', rate: r, time: d.time || '', source: d.source } : { state: 'none' };
    } catch (e) { fx = { state: 'none' }; }
    if (fx.state === 'none' && currency === 'TWD') currency = 'JPY';
    renderOrder(); renderBar();
  }
  // 頁面一直開著時，截止時間一到就切換狀態；匯率每 30 分鐘更新
  if (closeAt && !isClosed()) setTimeout(() => { renderMast(); renderOrder(); }, Math.min(closeAt.getTime() - Date.now() + 1000, 2 ** 31 - 1));
  setInterval(() => { if (!sending && !done) loadRate(); }, 30 * 60 * 1000);

  renderMast();
  renderCatalog();
  syncSteppers();
  renderBrandStates();
  renderOrder();
  renderBar();
  spy();
  loadRate();
})();
