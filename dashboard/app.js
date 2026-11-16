// Token Radar quantitative dashboard.
// Reads window.RADAR and renders the ranked pre-token board, live market benchmarks,
// per-protocol valuation drawer, interactive model sandbox, and actionable farm playbooks.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its primary network'; }
  function capitalTier(p) {
    if (p.tvl_usd >= 5e9) return 300;
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasEstimate(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('ethereum') >= 0 || c.indexOf('mainnet') >= 0) return { initial: '$15 - $25 in ETH gas', weekly: '$10 - $18 weekly gas' };
    if (c.indexOf('solana') >= 0) return { initial: 'under $0.02 in SOL', weekly: 'under $0.01 in SOL' };
    if (c.indexOf('arbitrum') >= 0 || c.indexOf('base') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('polygon') >= 0) return { initial: 'under $0.35 in L2 gas', weekly: 'under $0.20 weekly' };
    return { initial: 'under $2.00 in network gas', weekly: 'under $1.00 weekly' };
  }

  function categoryAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      return 'Deposit $' + capital + ' in USDC/stable collateral into ' + name + ' on ' + chain + ', borrow 20% to activate utilization points, and keep loan healthy.';
    }
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) {
      return 'Deposit $' + capital + ' USDC margin on ' + name + ' (' + chain + '), execute one low-leverage hedge position, and generate active trading volume.';
    }
    if (c.indexOf('restaking') >= 0 || c.indexOf('staking') >= 0) {
      return 'Stake $' + capital + ' of native ETH/LST via ' + name + ' on ' + chain + ' to accrue operator points and hold receipt token.';
    }
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) {
      return 'Provide $' + capital + ' of dual-sided liquidity to the core USDC pair on ' + name + ' (' + chain + ') and keep LP position staked.';
    }
    if (c.indexOf('rwa') >= 0) {
      return 'Mint $' + capital + ' of ' + name + ' yield-bearing asset on ' + chain + ' and hold to qualify for institutional points.';
    }
    if (c.indexOf('bridge') >= 0) {
      return 'Route $' + capital + ' across ' + chain + ' via ' + name + ' and interact with destination ecosystem contracts to log bridge volume.';
    }
    return 'Deposit $' + capital + ' into ' + name + "'s verified vault on " + chain + ' to establish qualified account history.';
  }

  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Maintain qualified activity through snapshot close.';
    return s;
  }

  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalTier(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasEstimate(chain);
    var action = categoryAction(p, capital, chain);
    return [
      { text: 'Isolate funding in a clean, non-custodial wallet dedicated to ' + p.name + ' on ' + chain + '; avoid direct transfers from centralized exchange addresses to prevent cluster flagging.', cost: 'Gas: ' + gas.initial, time: '5 minutes setup' },
      { text: action, cost: '$' + capital + ' allocated principal plus ' + gas.initial, time: '15 minutes initial deployment' },
      { text: 'Conduct recurring weekly protocol interactions (rebalancing, compounding accrued yield, or renewing liquidity) to establish an organic user score across multiple epochs.', cost: gas.weekly, time: '5-10 minutes weekly' },
      { text: 'Maintain position without withdrawal for at least ' + hold + ' continuous days to clear snapshot intervals and avoid mercenary capital penalties.', cost: '$' + capital + ' active balance remains committed', time: hold + ' days lockup' },
      { text: 'Audit official loyalty dashboard, Discord announcements, and verified points multipliers; verify SSL certs and contract addresses to reject phishing attempts.', cost: 'Free (read-only audit)', time: '5 minutes periodic check' },
      { text: 'Document wallet address, transaction hashes, and target criteria in an off-chain ledger; execute clean unwind upon official TGE / airdrop claiming snapshot.', cost: 'Gas: standard exit transaction', time: '10 minutes execution' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var parts = hash.split('/');
    if (parts[0] === 'protocol' && parts[1]) state.selected = parts[1];
    else if (parts[0] === 'live') state.tab = 'live';
    else if (parts[0] === 'model') state.tab = 'model';
    else if (parts[0] === 'board') state.tab = 'pre-token';
  }
  function writeHash() {
    if (state.selected) { window.location.hash = 'protocol/' + state.selected; return; }
    if (state.tab === 'live') { window.location.hash = 'live'; return; }
    if (state.tab === 'model') { window.location.hash = 'model'; return; }
    window.location.hash = 'board';
  }

  function categoriesOf(rows) {
    var set = {};
    rows.forEach(function (r) { if (r.category) set[r.category] = true; });
    var list = Object.keys(set).sort();
    list.unshift('all');
    return list;
  }

  function sortRows(rows, key, dir) {
    return rows.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'string') return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });
  }

  function renderHeader() {
    return el('header', { class: 'brand-header' },
      el('div', { class: 'brand-wrap' },
        el('div', { class: 'brand' },
          el('h1', { text: 'Token Radar' }),
          el('span', { class: 'pill', text: DATA.model_version || 'radar-v2' }),
          el('span', { class: 'source-meta', text: 'Snapshot: ' + DATA.as_of + ' (' + DATA.source + ')' })
        ),
        el('div', { class: 'stats' },
          el('div', { class: 'stat' }, el('span', { class: 'stat-num', text: String(DATA.board_size) }), el('span', { class: 'stat-label', text: 'Ranked' })),
          el('div', { class: 'stat' }, el('span', { class: 'stat-num', text: String(DATA.watchlist_size) }), el('span', { class: 'stat-label', text: 'Watchlist' })),
          el('div', { class: 'stat' }, el('span', { class: 'stat-num', text: String(DATA.early_size) }), el('span', { class: 'stat-label', text: 'Early' })),
          el('div', { class: 'stat' }, el('span', { class: 'stat-num', text: String(DATA.live_size) }), el('span', { class: 'stat-label', text: 'Live' }))
        )
      )
    );
  }

  function renderTabs() {
    return el('nav', { class: 'tabs', 'aria-label': 'Views' },
      el('button', {
        type: 'button',
        class: 'tab' + (state.tab === 'pre-token' ? ' active' : ''),
        text: 'Pre-token radar (' + DATA.board_size + ')',
        onclick: function () { state.tab = 'pre-token'; writeHash(); render(); }
      }),
      el('button', {
        type: 'button',
        class: 'tab' + (state.tab === 'live' ? ' active' : ''),
        text: 'Live benchmark (' + DATA.live_size + ')',
        onclick: function () { state.tab = 'live'; writeHash(); render(); }
      }),
      el('button', {
        type: 'button',
        class: 'tab' + (state.tab === 'model' ? ' active' : ''),
        text: 'Valuation formula',
        onclick: function () { state.tab = 'model'; writeHash(); render(); }
      })
    );
  }

  function renderControls() {
    var cats = categoriesOf(DATA.rows);
    return el('div', { class: 'controls' },
      el('label', { class: 'search-wrap' },
        el('span', { class: 'sr', text: 'Search protocols' }),
        el('input', {
          type: 'search',
          class: 'search',
          placeholder: 'Filter by name, chain, category...',
          value: state.q,
          oninput: function (e) { state.q = e.target.value.toLowerCase(); render(); }
        })
      ),
      el('div', { class: 'filter-group' },
        el('label', { class: 'sub', text: 'Category:' }),
        el('select', {
          class: 'select',
          onchange: function (e) { state.category = e.target.value; render(); }
        },
          cats.map(function (c) {
            return el('option', { value: c, text: c === 'all' ? 'All categories' : c, selected: state.category === c });
          })
        )
      )
    );
  }

  function renderTable(rows) {
    var filtered = rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.q) {
        var str = (r.name + ' ' + (r.category || '') + ' ' + (r.chains ? r.chains.join(' ') : '')).toLowerCase();
        if (str.indexOf(state.q) === -1) return false;
      }
      return true;
    });

    var sorted = sortRows(filtered, state.sort === 'implied' ? 'implied_value_usd' : state.sort, state.dir);

    function sortHeader(label, key) {
      var active = state.sort === key;
      var arrow = active ? (state.dir === -1 ? ' ↓' : ' ↑') : '';
      return el('th', {
        class: 'sortable' + (active ? ' active' : ''),
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = -1; }
          render();
        }
      }, label + arrow);
    }

    return el('div', { class: 'table-wrap' },
      el('table', { class: 'radar-table' },
        el('thead', null,
          el('tr', null,
            sortHeader('Rank', 'rank'),
            sortHeader('Protocol', 'name'),
            el('th', { text: 'Category' }),
            el('th', { text: 'Chains' }),
            sortHeader('TVL', 'tvl_usd'),
            sortHeader('7d Change', 'change_7d'),
            sortHeader('Age', 'age_days'),
            sortHeader('Implied Value', 'implied_value_usd'),
            el('th', { text: 'Plan' })
          )
        ),
        el('tbody', null,
          sorted.length === 0 ?
            el('tr', null, el('td', { colspan: '9', class: 'empty', text: 'No protocols match your search criteria.' })) :
            sorted.map(function (row) {
              return el('tr', {
                class: 'row-item' + (state.selected === row.slug ? ' selected' : ''),
                onclick: function () { openDetail(row.slug); }
              },
                el('td', { class: 'col-rank' }, '#' + row.rank),
                el('td', { class: 'col-name' },
                  el('b', { text: row.name }),
                  row.tvl_usd >= DATA.floor_usd ? el('span', { class: 'tag-watchlist', text: 'WATCHLIST' }) : el('span', { class: 'tag-early', text: 'EARLY' })
                ),
                el('td', { class: 'col-cat', text: row.category || 'General' }),
                el('td', { class: 'col-chains', text: row.chains && row.chains.length ? row.chains.slice(0, 2).join(', ') + (row.chains.length > 2 ? ' +' + (row.chains.length - 2) : '') : '—' }),
                el('td', { class: 'col-tvl num', text: fmtUsd(row.tvl_usd) }),
                el('td', { class: 'col-growth num ' + (row.change_7d > 0 ? 'pos' : (row.change_7d < 0 ? 'neg' : '')) }, fmtPct(row.change_7d)),
                el('td', { class: 'col-age num', text: fmtAge(row.age_days) }),
                el('td', { class: 'col-implied num' }, el('b', { text: fmtUsd(row.implied_value_usd) })),
                el('td', { class: 'col-btn' }, el('button', { class: 'btn-inspect', type: 'button', text: 'Playbook' }))
              );
            })
        )
      )
    );
  }

  function renderLiveTable(rows) {
    return el('div', { class: 'table-wrap' },
      el('div', { class: 'info-banner' },
        el('b', { text: 'Market Benchmarks: ' }),
        el('span', { text: 'Protocols with existing traded tokens and known market caps, for comparative multiple valuation.' })
      ),
      el('table', { class: 'radar-table' },
        el('thead', null,
          el('tr', null,
            el('th', { text: 'Protocol' }),
            el('th', { text: 'Category' }),
            el('th', { text: 'Chains' }),
            el('th', { text: 'TVL' }),
            el('th', { text: 'Market Cap' }),
            el('th', { text: 'P/TVL Multiple' }),
            el('th', { text: '7d Change' })
          )
        ),
        el('tbody', null,
          rows.map(function (row) {
            var mult = row.tvl_usd && row.mcap_usd ? (row.mcap_usd / row.tvl_usd).toFixed(2) + 'x' : 'n/a';
            return el('tr', { class: 'row-item' },
              el('td', { class: 'col-name' }, el('b', { text: row.name })),
              el('td', { class: 'col-cat', text: row.category || 'General' }),
              el('td', { class: 'col-chains', text: row.chains && row.chains.length ? row.chains.slice(0, 2).join(', ') : '—' }),
              el('td', { class: 'col-tvl num', text: fmtUsd(row.tvl_usd) }),
              el('td', { class: 'col-mcap num' }, el('b', { text: fmtUsd(row.mcap_usd) })),
              el('td', { class: 'col-mult num', text: mult }),
              el('td', { class: 'col-growth num ' + (row.change_7d > 0 ? 'pos' : (row.change_7d < 0 ? 'neg' : '')) }, fmtPct(row.change_7d))
            );
          })
        )
      )
    );
  }

  function renderModelSandbox() {
    var m = DATA.model;
    return el('div', { class: 'model-card' },
      el('h2', { text: 'Quantitative Implied Valuation Methodology' }),
      el('p', { text: 'Token Radar computes implied token valuation derived strictly from snapshot on-chain metrics, avoiding speculative name-bias.' }),
      el('div', { class: 'formula-box' },
        el('code', { text: 'Implied Valuation = Base TVL × Category Multiple × Growth Factor × Breadth Factor × Maturity Factor' })
      ),
      el('div', { class: 'breakdown-grid' },
        el('div', { class: 'metric-box' },
          el('span', { class: 'metric-name', text: 'Base Multiple' }),
          el('b', { class: 'metric-val', text: m.base_multiple + 'x TVL' }),
          el('p', { class: 'sub', text: 'Baseline conservative multiple for foundational DeFi protocol liquidity.' })
        ),
        el('div', { class: 'metric-box' },
          el('span', { class: 'metric-name', text: 'Category Weighting' }),
          el('b', { class: 'metric-val', text: '1.0x - 1.35x' }),
          el('p', { class: 'sub', text: 'Reflects fee-capture velocity (Perps/Derivatives: 1.35x, Lending: 1.22x, Restaking: 1.18x).' })
        ),
        el('div', { class: 'metric-box' },
          el('span', { class: 'metric-name', text: 'Growth Momentum' }),
          el('b', { class: 'metric-val', text: 'Weight: ' + m.growth_weight }),
          el('p', { class: 'sub', text: '7-day TVL change clamped between ' + m.growth_floor + '% and +' + m.growth_cap + '%.' })
        ),
        el('div', { class: 'metric-box' },
          el('span', { class: 'metric-name', text: 'Lindy / Maturity' }),
          el('b', { class: 'metric-val', text: m.maturity_floor + ' - 1.0x' }),
          el('p', { class: 'sub', text: 'Time in operation without a token, scaling toward full maturity at ' + m.maturity_days + ' days.' })
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail-dialog', id: 'detail' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);

    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('div', { class: 'detail-badges' },
          el('span', { class: 'badge-rank', text: 'Rank #' + row.rank }),
          row.tvl_usd >= DATA.floor_usd ? el('span', { class: 'tag-watchlist', text: 'WATCHLIST' }) : el('span', { class: 'tag-early', text: 'EARLY RADAR' })
        ),
        el('h2', { class: 'detail-title', text: row.name }),
        el('p', { class: 'detail-sub', text: (row.category || 'DeFi') + ' deployed on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'its primary network') })
      ),
      el('button', { class: 'btn-close', type: 'button', text: '✕', onclick: function () { dialog.close(); } })
    ));

    dialog.appendChild(el('div', { class: 'detail-body' },
      el('div', { class: 'valuation-summary' },
        el('div', { class: 'val-card' }, el('span', { text: 'Reported TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', { class: 'val-card' }, el('span', { text: '7d Inflow/Outflow' }), el('b', { class: 'num ' + (row.change_7d > 0 ? 'pos' : 'neg'), text: fmtPct(row.change_7d) })),
        el('div', { class: 'val-card' }, el('span', { text: 'Pre-Token Runway' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', { class: 'val-card highlight' }, el('span', { text: 'Implied Launch Valuation' }), el('b', { class: 'num val-big', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('div', { class: 'multipliers-row' },
        el('div', { class: 'chip' }, el('span', { text: 'Base Multiple: ' }), el('b', { text: DATA.model.base_multiple + 'x' })),
        el('div', { class: 'chip' }, el('span', { text: 'Category Mult: ' }), el('b', { text: (row.category_multiplier || 1.0) + 'x' })),
        el('div', { class: 'chip' }, el('span', { text: 'Growth Mult: ' }), el('b', { text: (row.growth_multiplier || 1.0) + 'x' })),
        el('div', { class: 'chip' }, el('span', { text: 'Breadth Mult: ' }), el('b', { text: (row.breadth_multiplier || 1.0) + 'x' })),
        el('div', { class: 'chip' }, el('span', { text: 'Maturity Mult: ' }), el('b', { text: (row.maturity_multiplier || 1.0) + 'x' }))
      ),
      el('div', { class: 'playbook-section' },
        el('h3', { text: 'Actionable Farming Playbook' }),
        el('ol', { class: 'steps-list' },
          steps.map(function (stepStr, idx) {
            return el('li', { class: 'step-item' },
              el('span', { class: 'step-idx', text: String(idx + 1) }),
              el('div', { class: 'step-content' }, el('p', { text: stepStr }))
            );
          })
        )
      )
    ));

    document.body.appendChild(dialog);
    dialog.showModal();
  }

  function render() {
    app.textContent = '';
    app.appendChild(renderHeader());
    app.appendChild(renderTabs());
    if (state.tab === 'pre-token') {
      app.appendChild(renderControls());
      app.appendChild(renderTable(DATA.rows));
    } else if (state.tab === 'live') {
      app.appendChild(renderLiveTable(DATA.live || []));
    } else if (state.tab === 'model') {
      app.appendChild(renderModelSandbox());
    }
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
  if (state.selected) openDetail(state.selected);
})();
