const CORE_STATS = ['STR','DEX','CON','INT','WIS','CHA','AGI','LCK','PER','WIL'];
const STARTING_POINTS = 50;
const POINTS_PER_LEVEL = 8;

// Equipment slots + what categories are allowed in each slot
const EQUIPMENT_SLOTS = [
  { key: 'Weapon', label: 'Weapon', categories: ['Weapon'] },
  { key: 'Offhand', label: 'Offhand', categories: ['Weapon','Trinket','Accessory'] },
  { key: 'Armor', label: 'Armor', categories: ['Armor'] },
  { key: 'Headwear', label: 'Headwear', categories: ['Headwear'] },
  { key: 'Trinket1', label: 'Trinket 1', categories: ['Trinket'] },
  { key: 'Trinket2', label: 'Trinket 2', categories: ['Trinket'] },
  { key: 'Trinket3', label: 'Trinket 3', categories: ['Trinket'] },
  { key: 'Accessory1', label: 'Accessory 1', categories: ['Accessory'] },
  { key: 'Accessory2', label: 'Accessory 2', categories: ['Accessory'] }
];

let titles = [];
let spells = [];
let abilities = [];
let items = [];

let character = newCharacter();
let currentTab = 'stats';

/* --------------------
   Character Model
-------------------- */
function newCharacter() {
  return {
    meta: { app: 'Homebrew Character Tracker', version: '1.1' },
    name: 'New Adventurer',
    titleId: 'none',
    level: 1,
    availablePoints: STARTING_POINTS,
    stats: Object.fromEntries(CORE_STATS.map(s => [s, 10])),

    // Currency
    currency: { gold: 0, silver: 0, copper: 0 },

    // Inventory
    inventory: [],              // store item IDs only
    inventoryNotes: '',

    // Equipment (slot -> itemId or null)
    equipped: Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s.key, null])),

    // Spells/Abilities (IDs only)
    spellsKnown: [],
    abilitiesKnown: []
  };
}

/* --------------------
   Bonuses / Effective stats
-------------------- */
function getItemById(id) {
  return items.find(x => x.id === id) || null;
}

function aggregateEquipmentBonuses(c) {
  const bonusTotals = Object.fromEntries(CORE_STATS.map(s => [s, 0]));

  const equipped = c.equipped || {};
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = equipped[slot.key];
    if (!itemId) continue;
    const it = getItemById(itemId);
    if (!it || !it.bonuses || typeof it.bonuses !== 'object') continue;

    for (const stat of CORE_STATS) {
      const add = Number(it.bonuses[stat] || 0);
      if (Number.isFinite(add) && add !== 0) bonusTotals[stat] += add;
    }
  }

  return bonusTotals;
}

function getEffectiveStats(c) {
  const base = c.stats || {};
  const bonuses = aggregateEquipmentBonuses(c);

  const effective = {};
  for (const stat of CORE_STATS) {
    effective[stat] = Number(base[stat] || 0) + Number(bonuses[stat] || 0);
  }
  return { effective, bonuses };
}

/* --------------------
   Derived Stats (from effective stats)
-------------------- */
function calculateDerived(c) {
  const { effective } = getEffectiveStats(c);
  const lvl = Number(c.level || 1);

  const CON = Number(effective.CON || 0);
  const WIL = Number(effective.WIL || 0);
  const INT = Number(effective.INT || 0);
  const PER = Number(effective.PER || 0);
  const STR = Number(effective.STR || 0);

  return {
    HP: CON + (lvl * 2) + Math.floor(WIL / 3),
    Mana: (INT * 3) + (lvl * 2),
    Sanity: Math.floor(WIL / 5),
    AC: 10 + (STR / 15),
    Accuracy: PER * 2,
    DOTRes: CON / 15
  };
}

/* --------------------
   Init
-------------------- */
async function init() {
  await loadAdminData();
  bindUI();
  setTab('stats');
  renderAll();
}

async function loadAdminData() {
  const [t, sp, ab, it] = await Promise.all([
    fetchJson('data/titles.json'),
    fetchJson('data/spells.json'),
    fetchJson('data/abilities.json'),
    fetchJson('data/items.json')
  ]);
  titles = t;
  spells = sp;
  abilities = ab;
  items = it;
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

/* --------------------
   UI Binding
-------------------- */
function bindUI() {
  document.getElementById('charName').addEventListener('input', e => {
    character.name = e.target.value;
  });

  document.getElementById('titleSelect').addEventListener('change', e => {
    character.titleId = e.target.value;
  });

  document.getElementById('levelUpBtn').addEventListener('click', () => {
    levelUp();
    renderAll();
  });

  document.getElementById('saveBtn').addEventListener('click', saveCharacter);
  document.getElementById('importInput').addEventListener('change', importCharacter);

  document.getElementById('newBtn').addEventListener('click', () => {
    character = newCharacter();
    setTab('stats');
    renderAll();
  });

  // Tabs
  document.querySelectorAll('.tabBtn').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  // Inventory
  document.getElementById('addItemBtn').addEventListener('click', () => {
    const id = document.getElementById('itemPick').value;
    addItem(id);
    renderAll();
  });

  document.getElementById('inventoryNotes').addEventListener('input', e => {
    character.inventoryNotes = e.target.value;
  });

  // Currency
  document.getElementById('goldInput').addEventListener('input', () => updateCurrencyFromInputs());
  document.getElementById('silverInput').addEventListener('input', () => updateCurrencyFromInputs());
  document.getElementById('copperInput').addEventListener('input', () => updateCurrencyFromInputs());

  // Spells
  document.getElementById('learnSpellBtn').addEventListener('click', () => {
    const id = document.getElementById('spellPick').value;
    learnSpell(id);
    renderAll();
  });

  // Abilities
  document.getElementById('learnAbilityBtn').addEventListener('click', () => {
    const id = document.getElementById('abilityPick').value;
    learnAbility(id);
    renderAll();
  });
}

function updateCurrencyFromInputs() {
  const gold = safeInt(document.getElementById('goldInput').value, 0);
  const silver = safeInt(document.getElementById('silverInput').value, 0);
  const copper = safeInt(document.getElementById('copperInput').value, 0);
  character.currency = { gold, silver, copper };
}

/* --------------------
   Tabs
-------------------- */
function setTab(tab) {
  currentTab = tab;

  document.querySelectorAll('.tabBtn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  ['stats','inventory','equipment','spells','abilities'].forEach(t => {
    document.getElementById(`tab_${t}`).classList.toggle('hidden', t !== tab);
  });
}

/* --------------------
   Rendering
-------------------- */
function renderAll() {
  renderTitles();
  renderMeta();

  renderStats();
  renderCurrency();
  renderDerived();

  renderItemPicker();
  renderInventory();
  renderInventoryNotes();

  renderEquipment();
  renderBonusSummary();

  renderSpellPicker();
  renderAbilityPicker();
  renderSpellsKnown();
  renderAbilitiesKnown();
}

function renderTitles() {
  const select = document.getElementById('titleSelect');
  select.innerHTML = '';

  titles.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.label;
    select.appendChild(opt);
  });

  const hasTitle = titles.some(t => t.id === character.titleId);
  if (!hasTitle && character.titleId) {
    const opt = document.createElement('option');
    opt.value = character.titleId;
    opt.textContent = `Unknown Title (${character.titleId})`;
    select.appendChild(opt);
  }

  select.value = character.titleId || 'none';
}

function renderMeta() {
  document.getElementById('levelDisplay').textContent = String(character.level);
  document.getElementById('pointsDisplay').textContent = String(character.availablePoints);
  document.getElementById('charName').value = character.name || '';
}

function renderStats() {
  const container = document.getElementById('statsContainer');
  container.innerHTML = '';

  const { bonuses } = getEffectiveStats(character);

  CORE_STATS.forEach(stat => {
    const row = document.createElement('div');
    row.className = 'stat';

    const label = document.createElement('span');
    label.textContent = stat;

    const base = Number(character.stats[stat] || 0);
    const bonus = Number(bonuses[stat] || 0);
    const show = bonus !== 0 ? `${base} (${bonus >= 0 ? '+' : ''}${bonus})` : `${base}`;

    const value = document.createElement('span');
    value.textContent = show;

    const btn = document.createElement('button');
    btn.textContent = '+1';
    btn.onclick = () => {
      incrementStat(stat);
      renderAll();
    };

    btn.disabled = character.availablePoints <= 0;
    if (btn.disabled) {
      btn.style.opacity = '0.55';
      btn.style.cursor = 'not-allowed';
    }

    row.appendChild(label);
    row.appendChild(value);
    row.appendChild(btn);
    container.appendChild(row);
  });
}

function renderCurrency() {
  const cur = character.currency || { gold:0, silver:0, copper:0 };
  document.getElementById('goldInput').value = String(cur.gold ?? 0);
  document.getElementById('silverInput').value = String(cur.silver ?? 0);
  document.getElementById('copperInput').value = String(cur.copper ?? 0);
}

function renderDerived() {
  const d = calculateDerived(character);
  const container = document.getElementById('derivedContainer');

  container.innerHTML = `
    <div class="derived">HP: <strong>${d.HP}</strong></div>
    <div class="derived">Mana: <strong>${d.Mana}</strong></div>
    <div class="derived">Sanity: <strong>${d.Sanity}</strong></div>
    <div class="derived">AC: <strong>${d.AC.toFixed(2)}</strong></div>
    <div class="derived">Accuracy: <strong>${d.Accuracy}</strong></div>
    <div class="derived">DOT Resistance: <strong>${d.DOTRes.toFixed(2)}</strong></div>
  `;
}

/* --------------------
   Inventory
-------------------- */
function renderItemPicker() {
  const select = document.getElementById('itemPick');
  select.innerHTML = '';

  const available = items
    .slice()
    .sort((a,b) => (a.name || '').localeCompare(b.name || ''));

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = available.length ? '-- select item --' : '-- no items available --';
  select.appendChild(placeholder);

  available.forEach(it => {
    const opt = document.createElement('option');
    opt.value = it.id;
    const tier = it.tier ? ` (${it.tier})` : '';
    const cat = it.category ? ` • ${it.category}` : '';
    opt.textContent = `${it.name}${tier}${cat}`;
    select.appendChild(opt);
  });

  select.value = '';
}

function renderInventoryNotes() {
  const el = document.getElementById('inventoryNotes');
  if (!el) return;
  el.value = character.inventoryNotes || '';
}

function renderInventory() {
  const container = document.getElementById('inventoryList');
  container.innerHTML = '';

  const inv = Array.isArray(character.inventory) ? character.inventory : [];
  if (!inv.length) {
    container.innerHTML = `<div class="muted">Inventory is empty.</div>`;
    return;
  }

  inv.forEach((id, idx) => {
    const it = getItemById(id);
    const title = it ? it.name : `Unknown Item (${id})`;
    const desc = it ? (it.description || '') : 'This ID is in the save file but not in admin data/items.json.';
    const metaBits = [];

    if (it?.tier) metaBits.push(`Tier ${it.tier}`);
    if (it?.category) metaBits.push(it.category);

    const meta = metaBits.length
      ? `<span class="pill">${escapeHtml(metaBits.join(' • '))}</span>`
      : '';

    const bonusStr = it?.bonuses ? formatBonuses(it.bonuses) : '';

    const card = document.createElement('div');
    card.className = 'listCard';
    card.innerHTML = `
      <div class="titleRow">
        <div>
          <strong>${escapeHtml(title)}</strong>
          ${meta ? `<div style="margin-top:6px;">${meta}</div>` : ''}
          ${bonusStr ? `<div class="muted small" style="margin-top:6px;">Bonuses: ${escapeHtml(bonusStr)}</div>` : ''}
        </div>
        <button class="secondary">Remove</button>
      </div>
      ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ''}
    `;

    card.querySelector('button').onclick = () => {
      removeItemAtIndex(idx);
      renderAll();
    };

    container.appendChild(card);
  });
}

function addItem(id) {
  if (!id) return;
  if (!Array.isArray(character.inventory)) character.inventory = [];
  character.inventory.push(id);
}

function removeItemAtIndex(idx) {
  if (!Array.isArray(character.inventory)) character.inventory = [];
  character.inventory.splice(idx, 1);
}

/* --------------------
   Equipment
-------------------- */
function renderEquipment() {
  const container = document.getElementById('equipmentContainer');
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'equipGrid';

  for (const slot of EQUIPMENT_SLOTS) {
    const box = document.createElement('div');
    box.className = 'equipSlot';

    const h = document.createElement('h3');
    h.textContent = slot.label;

    const select = document.createElement('select');

    // Empty option
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '<empty>';
    select.appendChild(empty);

    // Allowed items
    const allowed = items
      .filter(it => slot.categories.includes(it.category))
      .slice()
      .sort((a,b) => (a.name||'').localeCompare(b.name||''));

    for (const it of allowed) {
      const opt = document.createElement('option');
      opt.value = it.id;
      const tier = it.tier ? ` (${it.tier})` : '';
      opt.textContent = `${it.name}${tier}`;
      select.appendChild(opt);
    }

    const currentId = character.equipped?.[slot.key] || '';
    select.value = currentId;

    select.addEventListener('change', () => {
      setEquipped(slot.key, select.value || null);
      renderAll();
    });

    // Details
    const currentItem = currentId ? getItemById(currentId) : null;
    const details = document.createElement('div');
    details.className = 'muted small';
    details.style.marginTop = '0.5rem';
    if (currentId && !currentItem) {
      details.textContent = `Unknown equipped item (${currentId}) — missing from admin data/items.json.`;
    } else if (currentItem) {
      const bonusStr = currentItem.bonuses ? `Bonuses: ${formatBonuses(currentItem.bonuses)}` : 'No bonuses.';
      details.textContent = `${currentItem.category}${currentItem.tier ? ` • Tier ${currentItem.tier}` : ''} — ${bonusStr}`;
    } else {
      details.textContent = `Allowed: ${slot.categories.join(', ')}`;
    }

    box.appendChild(h);
    box.appendChild(select);
    box.appendChild(details);
    grid.appendChild(box);
  }

  container.appendChild(grid);
}

function setEquipped(slotKey, itemId) {
  if (!character.equipped || typeof character.equipped !== 'object') {
    character.equipped = Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s.key, null]));
  }

  // Validate category if item exists
  if (itemId) {
    const it = getItemById(itemId);
    const slot = EQUIPMENT_SLOTS.find(s => s.key === slotKey);
    if (it && slot && !slot.categories.includes(it.category)) {
      alert('That item cannot be equipped in this slot.');
      return;
    }
  }

  character.equipped[slotKey] = itemId;
}

function renderBonusSummary() {
  const el = document.getElementById('bonusSummary');
  const { bonuses } = getEffectiveStats(character);

  const parts = [];
  for (const stat of CORE_STATS) {
    const v = Number(bonuses[stat] || 0);
    if (v !== 0) parts.push(`${stat} ${v >= 0 ? '+' : ''}${v}`);
  }

  el.textContent = parts.length ? parts.join(' • ') : 'No active equipment bonuses.';
}

function formatBonuses(bonusesObj) {
  const parts = [];
  for (const stat of CORE_STATS) {
    const v = Number(bonusesObj?.[stat] || 0);
    if (Number.isFinite(v) && v !== 0) parts.push(`${stat} ${v >= 0 ? '+' : ''}${v}`);
  }
  return parts.join(', ');
}

/* --------------------
   Spells + Abilities
-------------------- */
function renderSpellPicker() {
  const select = document.getElementById('spellPick');
  select.innerHTML = '';

  const unknowns = getUnknownIds(character.spellsKnown, spells);

  const available = spells
    .filter(s => !character.spellsKnown.includes(s.id))
    .sort((a,b) => (a.name || '').localeCompare(b.name || ''));

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = available.length ? '-- select spell --' : '-- no spells available --';
  select.appendChild(placeholder);

  available.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });

  if (unknowns.length) {
    const sep = document.createElement('option');
    sep.value = '';
    sep.textContent = '— unknown spells in save —';
    sep.disabled = true;
    select.appendChild(sep);
    unknowns.forEach(id => {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = `Unknown (${id})`;
      opt.disabled = true;
      select.appendChild(opt);
    });
  }

  select.value = '';
}

function renderAbilityPicker() {
  const select = document.getElementById('abilityPick');
  select.innerHTML = '';

  const unknowns = getUnknownIds(character.abilitiesKnown, abilities);

  const available = abilities
    .filter(a => !character.abilitiesKnown.includes(a.id))
    .sort((a,b) => (a.name || '').localeCompare(b.name || ''));

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = available.length ? '-- select ability --' : '-- no abilities available --';
  select.appendChild(placeholder);

  available.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    select.appendChild(opt);
  });

  if (unknowns.length) {
    const sep = document.createElement('option');
    sep.value = '';
    sep.textContent = '— unknown abilities in save —';
    sep.disabled = true;
    select.appendChild(sep);
    unknowns.forEach(id => {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = `Unknown (${id})`;
      opt.disabled = true;
      select.appendChild(opt);
    });
  }

  select.value = '';
}

function renderSpellsKnown() {
  const container = document.getElementById('spellsKnown');
  container.innerHTML = '';

  const known = (character.spellsKnown || []).slice();
  if (!known.length) {
    container.innerHTML = `<div class="muted">No spells learned.</div>`;
    return;
  }

  known.forEach(id => {
    const sp = spells.find(s => s.id === id);
    container.appendChild(makeKnownCard({
      title: sp ? sp.name : `Unknown Spell (${id})`,
      desc: sp ? (sp.description || '') : 'This ID is in the save file but not in admin data/spells.json.',
      onForget: () => { forgetSpell(id); renderAll(); }
    }));
  });
}

function renderAbilitiesKnown() {
  const container = document.getElementById('abilitiesKnown');
  container.innerHTML = '';

  const known = (character.abilitiesKnown || []).slice();
  if (!known.length) {
    container.innerHTML = `<div class="muted">No abilities learned.</div>`;
    return;
  }

  known.forEach(id => {
    const ab = abilities.find(a => a.id === id);
    container.appendChild(makeKnownCard({
      title: ab ? ab.name : `Unknown Ability (${id})`,
      desc: ab ? (ab.description || '') : 'This ID is in the save file but not in admin data/abilities.json.',
      onForget: () => { forgetAbility(id); renderAll(); }
    }));
  });
}

function makeKnownCard({ title, desc, onForget }) {
  const card = document.createElement('div');
  card.className = 'listCard';

  const top = document.createElement('div');
  top.className = 'titleRow';

  const h = document.createElement('div');
  h.innerHTML = `<strong>${escapeHtml(title)}</strong>`;

  const btn = document.createElement('button');
  btn.className = 'secondary';
  btn.textContent = 'Forget';
  btn.onclick = onForget;

  top.appendChild(h);
  top.appendChild(btn);

  const d = document.createElement('div');
  d.className = 'desc';
  d.textContent = desc || '';

  card.appendChild(top);
  if (desc) card.appendChild(d);
  return card;
}

function learnSpell(id) {
  if (!id) return;
  if (!character.spellsKnown) character.spellsKnown = [];
  if (character.spellsKnown.includes(id)) return;
  character.spellsKnown.push(id);
}

function forgetSpell(id) {
  character.spellsKnown = (character.spellsKnown || []).filter(x => x !== id);
}

function learnAbility(id) {
  if (!id) return;
  if (!character.abilitiesKnown) character.abilitiesKnown = [];
  if (character.abilitiesKnown.includes(id)) return;
  character.abilitiesKnown.push(id);
}

function forgetAbility(id) {
  character.abilitiesKnown = (character.abilitiesKnown || []).filter(x => x !== id);
}

function getUnknownIds(knownIds, list) {
  const set = new Set(list.map(x => x.id));
  return (knownIds || []).filter(id => !set.has(id));
}

/* --------------------
   Core logic
-------------------- */
function incrementStat(stat) {
  if (character.availablePoints <= 0) return;
  character.stats[stat] = Number(character.stats[stat] || 0) + 1;
  character.availablePoints = Number(character.availablePoints || 0) - 1;
}

function levelUp() {
  character.level = Number(character.level || 1) + 1;
  character.availablePoints = Number(character.availablePoints || 0) + POINTS_PER_LEVEL;
}

/* --------------------
   Save / Load (file-based)
-------------------- */
function saveCharacter() {
  const safeName = (character.name || 'character')
    .trim()
    .replace(/[^\w\- ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'character';

  const data = JSON.stringify(character, null, 2);
  const blob = new Blob([data], { type: 'application/json' });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}.hb.json`;
  a.click();

  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importCharacter(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ''));

      const next = newCharacter();
      next.name = typeof parsed.name === 'string' ? parsed.name : next.name;
      next.titleId = typeof parsed.titleId === 'string' ? parsed.titleId : next.titleId;
      next.level = safeNumber(parsed.level, next.level);
      next.availablePoints = safeNumber(parsed.availablePoints, next.availablePoints);

      // stats
      next.stats = { ...next.stats };
      if (parsed.stats && typeof parsed.stats === 'object') {
        for (const k of CORE_STATS) {
          const v = Number(parsed.stats[k]);
          if (Number.isFinite(v)) next.stats[k] = v;
        }
      }

      // currency
      if (parsed.currency && typeof parsed.currency === 'object') {
        next.currency = {
          gold: safeInt(parsed.currency.gold, 0),
          silver: safeInt(parsed.currency.silver, 0),
          copper: safeInt(parsed.currency.copper, 0)
        };
      }

      // inventory + notes
      next.inventory = Array.isArray(parsed.inventory) ? parsed.inventory.filter(x => typeof x === 'string') : [];
      next.inventoryNotes = typeof parsed.inventoryNotes === 'string' ? parsed.inventoryNotes : '';

      // equipped
      if (parsed.equipped && typeof parsed.equipped === 'object') {
        for (const slot of EQUIPMENT_SLOTS) {
          const v = parsed.equipped[slot.key];
          next.equipped[slot.key] = (typeof v === 'string' && v.length) ? v : null;
        }
      }

      // spells/abilities
      next.spellsKnown = Array.isArray(parsed.spellsKnown) ? parsed.spellsKnown.filter(x => typeof x === 'string') : [];
      next.abilitiesKnown = Array.isArray(parsed.abilitiesKnown) ? parsed.abilitiesKnown.filter(x => typeof x === 'string') : [];

      character = next;
      renderAll();
    } catch (err) {
      alert('Import failed: invalid JSON file.');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

/* --------------------
   Helpers
-------------------- */
function safeNumber(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function safeInt(val, fallback) {
  const n = parseInt(String(val ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

init().catch(err => {
  console.error(err);
  alert('App failed to start. Check console for details.');
});
