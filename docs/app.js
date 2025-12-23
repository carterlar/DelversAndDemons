const CORE_STATS = ['STR','DEX','CON','INT','WIS','CHA','AGI','LCK','PER','WIL'];
const STARTING_POINTS = 50;
const POINTS_PER_LEVEL = 8;
const SCALING_MULTIPLIERS = { S: 1.00, A: 0.80, B: 0.60, C: 0.40, D: 0.20, E: 0.10 };

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
let adminSpells = [];
let adminAbilities = [];
let adminItems = [];

let character = newCharacter();
let currentTab = 'stats';

let editingCustomItemId = null;
let editingCustomSpellId = null;
let editingCustomAbilityId = null;

/* --------------------
   Character Model
-------------------- */
function newCharacter() {
  return {
    meta: { app: 'Homebrew Character Tracker', version: '1.3' },
    name: 'New Adventurer',
    titleId: 'none',
    level: 1,
    availablePoints: STARTING_POINTS,
    stats: Object.fromEntries(CORE_STATS.map(s => [s, 10])),

    currency: { gold: 0, silver: 0, copper: 0 },

    inventory: [],              // [{id, qty}]
    inventoryNotes: '',

    equipped: Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s.key, null])),

    spellsKnown: [],
    abilitiesKnown: [],

    // Saved settings
    settings: { equipInventoryOnly: false },

    // USER-CUSTOM content (lives in save file)
    customItems: [],
    customSpells: [],
    customAbilities: []
  };
}

/* --------------------
   Merged content accessors
-------------------- */
function getAllItems() {
  const c = Array.isArray(character.customItems) ? character.customItems : [];
  return [...adminItems, ...c];
}
function getAllSpells() {
  const c = Array.isArray(character.customSpells) ? character.customSpells : [];
  return [...adminSpells, ...c];
}
function getAllAbilities() {
  const c = Array.isArray(character.customAbilities) ? character.customAbilities : [];
  return [...adminAbilities, ...c];
}

function getItemById(id) {
  return getAllItems().find(x => x.id === id) || null;
}

/* --------------------
   Inventory qty helpers
-------------------- */
function normalizeInventory(inv) {
  if (!inv) return [];
  if (Array.isArray(inv) && inv.length && typeof inv[0] === 'string') {
    const map = new Map();
    for (const id of inv) {
      if (typeof id !== 'string') continue;
      map.set(id, (map.get(id) || 0) + 1);
    }
    return Array.from(map.entries()).map(([id, qty]) => ({ id, qty }));
  }

  if (Array.isArray(inv)) {
    const cleaned = [];
    for (const row of inv) {
      if (!row || typeof row !== 'object') continue;
      const id = typeof row.id === 'string' ? row.id : '';
      const qty = safeInt(row.qty, 0);
      if (!id || qty <= 0) continue;
      cleaned.push({ id, qty });
    }
    const map = new Map();
    for (const r of cleaned) map.set(r.id, (map.get(r.id) || 0) + r.qty);
    return Array.from(map.entries()).map(([id, qty]) => ({ id, qty }));
  }

  return [];
}

function getInventoryQty(id) {
  const row = (character.inventory || []).find(x => x.id === id);
  return row ? Number(row.qty || 0) : 0;
}

function addInventoryQty(id, delta) {
  if (!id || !Number.isFinite(delta) || delta === 0) return;
  character.inventory = normalizeInventory(character.inventory);

  const idx = character.inventory.findIndex(x => x.id === id);
  if (idx === -1) {
    if (delta > 0) character.inventory.push({ id, qty: delta });
  } else {
    const next = (Number(character.inventory[idx].qty || 0) + delta);
    if (next <= 0) character.inventory.splice(idx, 1);
    else character.inventory[idx].qty = next;
  }

  enforceEquipInventoryOnly();
}

/* --------------------
   Equipment bonuses / effective stats
-------------------- */
function isEquippableItem(it) {
  // default true if missing
  if (!it) return false;
  if (typeof it.equippable === 'boolean') return it.equippable;
  // Tools should default to non-equippable if category Tool
  if (String(it.category || '').toLowerCase() === 'tool') return false;
  return true;
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

function getEquippedWeaponId(c) {
  return c?.equipped?.Weapon || null;
}

function computeScalingBonusFromItem(c, item) {
  if (!item) return { bonus: 0, breakdown: [] };

  const { effective } = getEffectiveStats(c);

  // New format: per-stat ranks
  const byStat = (item.scalingByStat && typeof item.scalingByStat === 'object')
    ? item.scalingByStat
    : null;

  // Old format: same rank for all listed stats
  const defaultRank = String(item.scalingRank || item.tier || '').toUpperCase();
  const defaultMult = Number(SCALING_MULTIPLIERS[defaultRank] ?? 0);

  let bonus = 0;
  const breakdown = [];

  if (byStat) {
    for (const [stat, rankRaw] of Object.entries(byStat)) {
      if (!CORE_STATS.includes(stat)) continue;
      const rank = String(rankRaw || '').toUpperCase();
      const mult = Number(SCALING_MULTIPLIERS[rank] ?? 0);
      const contrib = Number(effective[stat] || 0) * mult;
      if (mult !== 0 && contrib !== 0) {
        bonus += contrib;
        breakdown.push({ stat, rank, mult, contrib });
      }
    }
  } else {
    const scalesWith = Array.isArray(item.scalesWith) ? item.scalesWith : [];
    for (const stat of scalesWith) {
      if (!CORE_STATS.includes(stat)) continue;
      const contrib = Number(effective[stat] || 0) * defaultMult;
      if (defaultMult !== 0 && contrib !== 0) {
        bonus += contrib;
        breakdown.push({ stat, rank: defaultRank, mult: defaultMult, contrib });
      }
    }
  }

  return { bonus, breakdown };
}


function computeWeaponDamage(c) {
  const weaponId = c?.equipped?.Weapon || null;
  if (!weaponId) return { weaponId: null, baseDamage: 0, bonusDamage: 0, total: 0, breakdown: [] };

  const it = getItemById(weaponId);
  if (!it) return { weaponId, baseDamage: 0, bonusDamage: 0, total: 0, breakdown: [] };

  const baseDamage = Number(it.baseDamage || 0);

  const { bonus, breakdown } = computeScalingBonusFromItem(c, it);

  const bonusDamage = Math.floor(bonus);
  const total = Math.floor(baseDamage + bonusDamage);

  return { weaponId, baseDamage, bonusDamage, total, breakdown };
}


/* --------------------
   Derived Stats
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
   Init / Load admin data
-------------------- */
async function init() {
  await loadAdminData();
  bindUI();
  buildCustomScalingGrid();
  buildCustomBonusGrid();
  buildCustomBonusGrid();
  buildCustomBonusGrid();
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
  adminSpells = sp;
  adminAbilities = ab;
  adminItems = it;
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
  
  document.getElementById('customItemCategory').addEventListener('change', () => {
  // Default equippable: Tools off, others on (user can override)
  const cat = (document.getElementById('customItemCategory').value || '').toLowerCase();
  if (!editingCustomItemId) {
    document.getElementById('customItemEquippable').checked = (cat !== 'tool');
  }
  updateCustomItemEditorVisibility();
});


  document.getElementById('saveBtn').addEventListener('click', saveCharacter);
  document.getElementById('importInput').addEventListener('change', importCharacter);

  document.getElementById('newBtn').addEventListener('click', () => {
    character = newCharacter();
    editingCustomItemId = null;
    editingCustomSpellId = null;
    editingCustomAbilityId = null;
    buildCustomBonusGrid();
    setTab('stats');
    renderAll();
  });

  document.querySelectorAll('.tabBtn').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  // Inventory
  document.getElementById('addItemBtn').addEventListener('click', () => {
    const id = document.getElementById('itemPick').value;
    if (!id) return;
    addInventoryQty(id, +1);
    renderAll();
  });

  document.getElementById('inventoryNotes').addEventListener('input', e => {
    character.inventoryNotes = e.target.value;
  });

  // Equip-from-inventory toggle
  document.getElementById('equipInventoryOnlyToggle').addEventListener('change', e => {
    character.settings = character.settings || {};
    character.settings.equipInventoryOnly = !!e.target.checked;
    enforceEquipInventoryOnly();
    renderAll();
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

  // Custom: Item select/new/delete/save
  document.getElementById('customItemSelect').addEventListener('change', e => {
    const id = e.target.value || null;
    loadCustomItemIntoForm(id);
  });
  document.getElementById('customItemNewBtn').addEventListener('click', () => {
    loadCustomItemIntoForm(null);
  });
  document.getElementById('customItemDeleteBtn').addEventListener('click', () => {
    if (!editingCustomItemId) return;
    character.customItems = (character.customItems || []).filter(x => x.id !== editingCustomItemId);
    // remove from inventory/equipment if present
    character.inventory = normalizeInventory(character.inventory).filter(x => x.id !== editingCustomItemId);
    for (const slot of EQUIPMENT_SLOTS) {
      if (character.equipped?.[slot.key] === editingCustomItemId) character.equipped[slot.key] = null;
    }
    editingCustomItemId = null;
    renderAll();
    loadCustomItemIntoForm(null);
  });
  document.getElementById('customItemSaveBtn').addEventListener('click', () => {
    saveCustomItemFromForm();
    renderAll();
  });

  // Custom: Spell
  document.getElementById('customSpellSelect').addEventListener('change', e => {
    loadCustomSpellIntoForm(e.target.value || null);
  });
  document.getElementById('customSpellNewBtn').addEventListener('click', () => loadCustomSpellIntoForm(null));
  document.getElementById('customSpellDeleteBtn').addEventListener('click', () => {
    if (!editingCustomSpellId) return;
    character.customSpells = (character.customSpells || []).filter(x => x.id !== editingCustomSpellId);
    character.spellsKnown = (character.spellsKnown || []).filter(id => id !== editingCustomSpellId);
    editingCustomSpellId = null;
    renderAll();
    loadCustomSpellIntoForm(null);
  });
  document.getElementById('customSpellSaveBtn').addEventListener('click', () => {
    saveCustomSpellFromForm();
    renderAll();
  });

  // Custom: Ability
  document.getElementById('customAbilitySelect').addEventListener('change', e => {
    loadCustomAbilityIntoForm(e.target.value || null);
  });
  document.getElementById('customAbilityNewBtn').addEventListener('click', () => loadCustomAbilityIntoForm(null));
  document.getElementById('customAbilityDeleteBtn').addEventListener('click', () => {
    if (!editingCustomAbilityId) return;
    character.customAbilities = (character.customAbilities || []).filter(x => x.id !== editingCustomAbilityId);
    character.abilitiesKnown = (character.abilitiesKnown || []).filter(id => id !== editingCustomAbilityId);
    editingCustomAbilityId = null;
    renderAll();
    loadCustomAbilityIntoForm(null);
  });
  document.getElementById('customAbilitySaveBtn').addEventListener('click', () => {
    saveCustomAbilityFromForm();
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
  document.querySelectorAll('.tabBtn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ['stats','inventory','equipment','spells','abilities','custom'].forEach(t => {
    document.getElementById(`tab_${t}`).classList.toggle('hidden', t !== tab);
  });
}

/* --------------------
   Render
-------------------- */
function renderAll() {
  renderTitles();
  renderMeta();

  renderStats();
  renderCurrency();
  renderDerived();

  renderItemPicker();
  renderInventoryNotes();
  renderInventory();

  renderEquipmentToggle();
  renderEquipment();
  renderBonusSummary();

  renderSpellPicker();
  renderAbilityPicker();
  renderSpellsKnown();
  renderAbilitiesKnown();

  renderCustomSelectors();
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
    btn.onclick = () => { incrementStat(stat); renderAll(); };
    btn.disabled = character.availablePoints <= 0;
    if (btn.disabled) { btn.style.opacity = '0.55'; btn.style.cursor = 'not-allowed'; }

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
   Inventory UI
-------------------- */
function renderItemPicker() {
  const select = document.getElementById('itemPick');
  select.innerHTML = '';

  const allItems = getAllItems().slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = allItems.length ? '-- select item --' : '-- no items available --';
  select.appendChild(placeholder);

  allItems.forEach(it => {
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
  document.getElementById('inventoryNotes').value = character.inventoryNotes || '';
}

function renderInventory() {
  const container = document.getElementById('inventoryList');
  container.innerHTML = '';

  character.inventory = normalizeInventory(character.inventory);
  const inv = character.inventory;
  if (!inv.length) {
    container.innerHTML = `<div class="muted">Inventory is empty.</div>`;
    return;
  }

  const sorted = inv.slice().sort((a,b) => {
    const ia = getItemById(a.id);
    const ib = getItemById(b.id);
    return (ia?.name || a.id).localeCompare(ib?.name || b.id);
  });

  for (const row of sorted) {
    const it = getItemById(row.id);
    const title = it ? it.name : `Unknown Item (${row.id})`;
    const desc = it ? (it.description || '') : 'This ID is in the save file but not in admin/custom items.';
    const metaBits = [];
    if (it?.tier) metaBits.push(`Tier ${it.tier}`);
    if (it?.category) metaBits.push(it.category);

    const meta = metaBits.length ? `<span class="pill">${escapeHtml(metaBits.join(' • '))}</span>` : '';
    const bonusStr = it?.bonuses ? formatBonuses(it.bonuses) : '';

    const card = document.createElement('div');
    card.className = 'listCard';
    card.innerHTML = `
      <div class="titleRow">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <div class="muted small" style="margin-top:6px;">Qty: <strong>${row.qty}</strong></div>
          ${meta ? `<div style="margin-top:6px;">${meta}</div>` : ''}
          ${bonusStr ? `<div class="muted small" style="margin-top:6px;">Bonuses: ${escapeHtml(bonusStr)}</div>` : ''}
          ${it && !isEquippableItem(it) ? `<div class="muted small" style="margin-top:6px;">Not equippable</div>` : ''}
        </div>
        <div class="qtyRow">
          <button class="secondary" data-act="minus">-1</button>
          <button class="secondary" data-act="plus">+1</button>
          <button class="secondary" data-act="remove">Remove</button>
        </div>
      </div>
      ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ''}
    `;

    card.querySelector('button[data-act="minus"]').onclick = () => { addInventoryQty(row.id, -1); renderAll(); };
    card.querySelector('button[data-act="plus"]').onclick = () => { addInventoryQty(row.id, +1); renderAll(); };
    card.querySelector('button[data-act="remove"]').onclick = () => { addInventoryQty(row.id, -999999); renderAll(); };

    container.appendChild(card);
  }
}

/* --------------------
   Equipment inventory-only mode
-------------------- */
function renderEquipmentToggle() {
  const toggle = document.getElementById('equipInventoryOnlyToggle');
  character.settings = character.settings || {};
  toggle.checked = !!character.settings.equipInventoryOnly;
}

function enforceEquipInventoryOnly() {
  character.settings = character.settings || {};
  if (!character.settings.equipInventoryOnly) return;

  for (const slot of EQUIPMENT_SLOTS) {
    const id = character.equipped?.[slot.key];
    if (!id) continue;
    if (getInventoryQty(id) <= 0) character.equipped[slot.key] = null;
  }
}

function formatWeaponBonusDamageLine(c, weaponItem) {
  if (!weaponItem) return 'Bonus Damage: +0';

  const dmg = computeWeaponDamage(c);
  const bonus = dmg?.bonusDamage ?? 0;

  let tail = '';
  if (Array.isArray(dmg?.breakdown) && dmg.breakdown.length) {
    const parts = dmg.breakdown
      .map(x => `${x.stat}×${x.rank}`)
      .join(' + ');
    tail = ` (${parts})`;
  } else {
    // If no breakdown, still show tier if present
    const r = String(weaponItem.scalingRank || weaponItem.tier || '').toUpperCase();
    if (r) tail = ` (Rank ${r})`;
  }

  return `Bonus Damage: +${bonus}${tail}`;
}


function formatItemBonusText(slotKey, c, item) {
  if (!item) return '';

  // Weapon
  if (slotKey === 'Weapon') {
    return formatWeaponBonusDamageLine(c, item);
  }

  // Armor / Headwear
  if (slotKey === 'Armor' || slotKey === 'Headwear') {
    const ac = Number(item.acBonus || 0);
    const acSafe = Number.isFinite(ac) ? ac : 0;
    return `Bonus AC: +${acSafe.toFixed(2)}`;
  }

  // Everything else: direct stat bonuses (optional)
  if (item.bonuses && typeof item.bonuses === 'object') {
    const s = formatBonuses(item.bonuses);
    return s ? `Bonuses: ${s}` : 'No bonuses.';
  }

  return 'No bonuses.';
}


function renderEquipment() {
  const container = document.getElementById('equipmentContainer');
  container.innerHTML = '';

  character.inventory = normalizeInventory(character.inventory);
  enforceEquipInventoryOnly();

  const onlyOwned = !!(character.settings && character.settings.equipInventoryOnly);
  const ownedSet = new Set(character.inventory.map(x => x.id));
  const allItems = getAllItems();

  const grid = document.createElement('div');
  grid.className = 'equipGrid';

  for (const slot of EQUIPMENT_SLOTS) {
    const box = document.createElement('div');
    box.className = 'equipSlot';

    const h = document.createElement('h3');
    h.textContent = slot.label;

    const select = document.createElement('select');

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '<empty>';
    select.appendChild(empty);

    const allowed = allItems
      .filter(it => slot.categories.includes(it.category))
      .filter(it => isEquippableItem(it))                // <- Tools/non-eq never show here
      .filter(it => !onlyOwned || ownedSet.has(it.id))
      .slice()
      .sort((a,b) => (a.name||'').localeCompare(b.name||''));

    for (const it of allowed) {
      const opt = document.createElement('option');
      opt.value = it.id;
      const tier = it.tier ? ` (${it.tier})` : '';
      const qty = onlyOwned ? ` • Qty ${getInventoryQty(it.id)}` : '';
      opt.textContent = `${it.name}${tier}${qty}`;
      select.appendChild(opt);
    }

    const currentId = character.equipped?.[slot.key] || '';
    select.value = currentId;

    select.addEventListener('change', () => {
      setEquipped(slot.key, select.value || null);
      renderAll();
    });

    const currentItem = currentId ? getItemById(currentId) : null;
    const details = document.createElement('div');
    details.className = 'muted small';
    details.style.marginTop = '0.5rem';

        if (currentId && !currentItem) {
      details.textContent = `Unknown equipped item (${currentId}) — missing from admin/custom items.`;
    } else if (currentItem) {
      const owned = getInventoryQty(currentId);
      const ownedNote = onlyOwned ? ` • Owned: ${owned}` : '';

      const bonusText = formatItemBonusText(slot.key, character, currentItem);

      details.textContent =
        `${currentItem.category}${currentItem.tier ? ` • Tier ${currentItem.tier}` : ''}${ownedNote} — ${bonusText}`;
    } else {
      details.textContent = `Allowed: ${slot.categories.join(', ')}${onlyOwned ? ' • (filtered to inventory)' : ''}`;
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

  if (itemId) {
    const it = getItemById(itemId);
    const slot = EQUIPMENT_SLOTS.find(s => s.key === slotKey);

    if (it && slot && !slot.categories.includes(it.category)) {
      alert('That item cannot be equipped in this slot.');
      return;
    }
    if (it && !isEquippableItem(it)) {
      alert('That item is not equippable (e.g., Tool).');
      return;
    }

    character.settings = character.settings || {};
    if (character.settings.equipInventoryOnly && getInventoryQty(itemId) <= 0) {
      alert('You can only equip items you have in inventory (qty > 0).');
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


  function buildCustomScaleStatGrid() {
    const grid = document.getElementById('customItemScaleStatGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const stat of CORE_STATS) {
      const lab = document.createElement('label');
      lab.innerHTML = `<input type="checkbox" id="scale_${stat}" /> ${stat}`;
      grid.appendChild(lab);
    }
  }
  
  function buildCustomBonusGrid() {
    const grid = document.getElementById('customItemBonusGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const stat of CORE_STATS) {
      const lab = document.createElement('label');
      lab.innerHTML = `${stat}<input type="number" id="bonus_${stat}" step="1" value="0" />`;
      grid.appendChild(lab);
    }
  }

    function updateCustomItemEditorVisibility() {
      const cat = (document.getElementById('customItemCategory')?.value || '').toLowerCase();
      const isWeapon = cat === 'weapon';
      const section = document.getElementById('weaponScalingSection');
      if (section) section.style.display = isWeapon ? '' : 'none';
    }

/* --------------------
   Spells / Abilities (merged lists)
-------------------- */
function renderSpellPicker() {
  const select = document.getElementById('spellPick');
  select.innerHTML = '';

  const allSpells = getAllSpells();
  const available = allSpells
    .filter(s => !(character.spellsKnown || []).includes(s.id))
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

  select.value = '';
}

function renderAbilityPicker() {
  const select = document.getElementById('abilityPick');
  select.innerHTML = '';

  const allAbilities = getAllAbilities();
  const available = allAbilities
    .filter(a => !(character.abilitiesKnown || []).includes(a.id))
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

  select.value = '';
}

function renderSpellsKnown() {
  const container = document.getElementById('spellsKnown');
  container.innerHTML = '';

  const allSpells = getAllSpells();
  const known = (character.spellsKnown || []).slice();
  if (!known.length) {
    container.innerHTML = `<div class="muted">No spells learned.</div>`;
    return;
  }

  known.forEach(id => {
    const sp = allSpells.find(s => s.id === id);
    container.appendChild(makeKnownCard({
      title: sp ? sp.name : `Unknown Spell (${id})`,
      desc: sp ? (sp.description || '') : 'This ID is in the save file but not in admin/custom spells.',
      onForget: () => { forgetSpell(id); renderAll(); }
    }));
  });
}

function renderAbilitiesKnown() {
  const container = document.getElementById('abilitiesKnown');
  container.innerHTML = '';

  const allAbilities = getAllAbilities();
  const known = (character.abilitiesKnown || []).slice();
  if (!known.length) {
    container.innerHTML = `<div class="muted">No abilities learned.</div>`;
    return;
  }

  known.forEach(id => {
    const ab = allAbilities.find(a => a.id === id);
    container.appendChild(makeKnownCard({
      title: ab ? ab.name : `Unknown Ability (${id})`,
      desc: ab ? (ab.description || '') : 'This ID is in the save file but not in admin/custom abilities.',
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
  character.spellsKnown = Array.isArray(character.spellsKnown) ? character.spellsKnown : [];
  if (!character.spellsKnown.includes(id)) character.spellsKnown.push(id);
}

function forgetSpell(id) {
  character.spellsKnown = (character.spellsKnown || []).filter(x => x !== id);
}

function learnAbility(id) {
  if (!id) return;
  character.abilitiesKnown = Array.isArray(character.abilitiesKnown) ? character.abilitiesKnown : [];
  if (!character.abilitiesKnown.includes(id)) character.abilitiesKnown.push(id);
}

function forgetAbility(id) {
  character.abilitiesKnown = (character.abilitiesKnown || []).filter(x => x !== id);
}

/* --------------------
   Custom Content UI
-------------------- */

function buildCustomScalingGrid() {
  const grid = document.getElementById('customItemScalingGrid');
  if (!grid) return;

  grid.innerHTML = '';

  const options = [
    { v: '', t: '(none)' },
    { v: 'E', t: 'E' },
    { v: 'D', t: 'D' },
    { v: 'C', t: 'C' },
    { v: 'B', t: 'B' },
    { v: 'A', t: 'A' },
    { v: 'S', t: 'S' }
  ];

  for (const stat of CORE_STATS) {
    const cell = document.createElement('div');
    cell.className = 'scaleCell';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = stat;

    const sel = document.createElement('select');
    sel.id = `scaleRank_${stat}`;

    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.t;
      sel.appendChild(opt);
    }

    cell.appendChild(label);
    cell.appendChild(sel);
    grid.appendChild(cell);
  }
}


function renderCustomSelectors() {
  // Items
  const itemSel = document.getElementById('customItemSelect');
  itemSel.innerHTML = '';
  const items = (character.customItems || []).slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
  itemSel.appendChild(makeOpt('', '-- select custom item --'));
  for (const it of items) itemSel.appendChild(makeOpt(it.id, it.name));
  itemSel.value = editingCustomItemId || '';

  // Spells
  const spSel = document.getElementById('customSpellSelect');
  spSel.innerHTML = '';
  const spells = (character.customSpells || []).slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
  spSel.appendChild(makeOpt('', '-- select custom spell --'));
  for (const s of spells) spSel.appendChild(makeOpt(s.id, s.name));
  spSel.value = editingCustomSpellId || '';

  // Abilities
  const abSel = document.getElementById('customAbilitySelect');
  abSel.innerHTML = '';
  const abs = (character.customAbilities || []).slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
  abSel.appendChild(makeOpt('', '-- select custom ability --'));
  for (const a of abs) abSel.appendChild(makeOpt(a.id, a.name));
  abSel.value = editingCustomAbilityId || '';
}

function makeOpt(val, text) {
  const opt = document.createElement('option');
  opt.value = val;
  opt.textContent = text;
  return opt;
}

function buildCustomBonusGrid() {
  const grid = document.getElementById('customItemBonusGrid');
  grid.innerHTML = '';
  for (const stat of CORE_STATS) {
    const lab = document.createElement('label');
    lab.innerHTML = `${stat}<input type="number" id="bonus_${stat}" step="1" value="0" />`;
    grid.appendChild(lab);
  }
}

function loadCustomItemIntoForm(id) {
  const list = character.customItems || [];
  const found = id ? list.find(x => x.id === id) : null;
  editingCustomItemId = found ? found.id : null;

  document.getElementById('customItemName').value = found?.name || '';
  document.getElementById('customItemCategory').value = found?.category || 'Other';
  document.getElementById('customItemTier').value = found?.tier || '';
  document.getElementById('customItemDesc').value = found?.description || '';

  // Equippable default:
  if (found) {
    document.getElementById('customItemEquippable').checked = !!found.equippable;
  } else {
    const cat = (document.getElementById('customItemCategory').value || '').toLowerCase();
    document.getElementById('customItemEquippable').checked = (cat !== 'tool');
  }

  // AC Bonus
  document.getElementById('customItemAcBonus').value = String(Number(found?.acBonus || 0));

  // Weapon fields
  // Weapon fields
  document.getElementById('customItemBaseDamage').value = String(Number(found?.baseDamage || 0));

  // Weapon scaling per-stat dropdowns:
  // Prefer new format scalingByStat, fall back to old scalesWith + tier for legacy custom items.
  const byStat = (found?.scalingByStat && typeof found.scalingByStat === 'object') ? found.scalingByStat : null;
  const legacyRank = String(found?.scalingRank || found?.tier || '').toUpperCase();
  const legacySet = new Set(Array.isArray(found?.scalesWith) ? found.scalesWith : []);

  for (const stat of CORE_STATS) {
    const el = document.getElementById(`scaleRank_${stat}`);
    if (!el) continue;

    if (byStat && typeof byStat[stat] === 'string') {
      el.value = String(byStat[stat]).toUpperCase();
    } else if (legacySet.has(stat) && legacyRank) {
      el.value = legacyRank;
    } else {
      el.value = '';
    }


  // Direct stat bonuses
  for (const stat of CORE_STATS) {
    const v = Number(found?.bonuses?.[stat] || 0);
    const el = document.getElementById(`bonus_${stat}`);
    if (el) el.value = String(Number.isFinite(v) ? v : 0);
  }

  updateCustomItemEditorVisibility();
  renderCustomSelectors();
}


function saveCustomItemFromForm() {
  const name = (document.getElementById('customItemName').value || '').trim();
  if (!name) { alert('Custom item needs a name.'); return; }

  const category = document.getElementById('customItemCategory').value || 'Other';
  const tier = document.getElementById('customItemTier').value || '';
  const description = (document.getElementById('customItemDesc').value || '').trim();
  const equippable = !!document.getElementById('customItemEquippable').checked;

  // AC bonus (Armor/Headwear)
  const acBonusRaw = Number(document.getElementById('customItemAcBonus').value || 0);
  const acBonus = Number.isFinite(acBonusRaw) ? acBonusRaw : 0;

  // Weapon scaling fields
  const baseDamageRaw = Number(document.getElementById('customItemBaseDamage').value || 0);
  const baseDamage = Number.isFinite(baseDamageRaw) ? baseDamageRaw : 0;

  const scalesWith = [];
  for (const stat of CORE_STATS) {
    const el = document.getElementById(`scale_${stat}`);
    if (el && el.checked) scalesWith.push(stat);
  }

  // Direct stat bonuses fields
  const bonuses = {};
  for (const stat of CORE_STATS) {
    const n = Number(document.getElementById(`bonus_${stat}`).value || 0);
    if (Number.isFinite(n) && n !== 0) bonuses[stat] = n;
  }

  const obj = {
    id: editingCustomItemId || makeCustomId('citem'),
    name,
    category,
    description,
    equippable,
    ...(tier ? { tier } : {}),
    ...(acBonus !== 0 ? { acBonus } : {}),
    ...(baseDamage !== 0 ? { baseDamage } : {}),
    ...(hasScalingByStat ? { scalingByStat } : {}),
    ...(Object.keys(bonuses).length ? { bonuses } : {})
  };

  character.customItems = Array.isArray(character.customItems) ? character.customItems : [];
  const idx = character.customItems.findIndex(x => x.id === obj.id);
  if (idx === -1) character.customItems.push(obj);
  else character.customItems[idx] = obj;

  editingCustomItemId = obj.id;

  // If equip-from-inventory-only is on, keep equipment valid
  enforceEquipInventoryOnly();

  renderCustomSelectors();
  updateCustomItemEditorVisibility();
}


function loadCustomSpellIntoForm(id) {
  const list = character.customSpells || [];
  const found = id ? list.find(x => x.id === id) : null;
  editingCustomSpellId = found ? found.id : null;

  document.getElementById('customSpellName').value = found?.name || '';
  document.getElementById('customSpellDesc').value = found?.description || '';

  renderCustomSelectors();
}

function saveCustomSpellFromForm() {
  const name = (document.getElementById('customSpellName').value || '').trim();
  if (!name) { alert('Custom spell needs a name.'); return; }
  const description = (document.getElementById('customSpellDesc').value || '').trim();

  const obj = { id: editingCustomSpellId || makeCustomId('cspell'), name, description };

  character.customSpells = Array.isArray(character.customSpells) ? character.customSpells : [];
  const idx = character.customSpells.findIndex(x => x.id === obj.id);
  if (idx === -1) character.customSpells.push(obj);
  else character.customSpells[idx] = obj;

  editingCustomSpellId = obj.id;
  renderCustomSelectors();
}

function loadCustomAbilityIntoForm(id) {
  const list = character.customAbilities || [];
  const found = id ? list.find(x => x.id === id) : null;
  editingCustomAbilityId = found ? found.id : null;

  document.getElementById('customAbilityName').value = found?.name || '';
  document.getElementById('customAbilityDesc').value = found?.description || '';

  renderCustomSelectors();
}

function saveCustomAbilityFromForm() {
  const name = (document.getElementById('customAbilityName').value || '').trim();
  if (!name) { alert('Custom ability needs a name.'); return; }
  const description = (document.getElementById('customAbilityDesc').value || '').trim();

  const obj = { id: editingCustomAbilityId || makeCustomId('cabil'), name, description };

  character.customAbilities = Array.isArray(character.customAbilities) ? character.customAbilities : [];
  const idx = character.customAbilities.findIndex(x => x.id === obj.id);
  if (idx === -1) character.customAbilities.push(obj);
  else character.customAbilities[idx] = obj;

  editingCustomAbilityId = obj.id;
  renderCustomSelectors();
}

function makeCustomId(prefix) {
  // short, deterministic-enough for local use; stored in save file
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
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
   Save / Import
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
      next.customItems = Array.isArray(parsed.customItems)
        ? parsed.customItems.filter(x => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string')
        : [];
      next.customSpells = Array.isArray(parsed.customSpells)
        ? parsed.customSpells.filter(x => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string')
        : [];
      next.customAbilities = Array.isArray(parsed.customAbilities)
        ? parsed.customAbilities.filter(x => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string')
        : [];
      next.name = typeof parsed.name === 'string' ? parsed.name : next.name;
      next.titleId = typeof parsed.titleId === 'string' ? parsed.titleId : next.titleId;
      next.level = safeNumber(parsed.level, next.level);
      next.availablePoints = safeNumber(parsed.availablePoints, next.availablePoints);

      if (parsed.stats && typeof parsed.stats === 'object') {
        for (const k of CORE_STATS) {
          const v = Number(parsed.stats[k]);
          if (Number.isFinite(v)) next.stats[k] = v;
        }
      }

      if (parsed.currency && typeof parsed.currency === 'object') {
        next.currency = {
          gold: safeInt(parsed.currency.gold, 0),
          silver: safeInt(parsed.currency.silver, 0),
          copper: safeInt(parsed.currency.copper, 0)
        };
      }

      // inventory supports old/new
      next.inventory = normalizeInventory(parsed.inventory);
      next.inventoryNotes = typeof parsed.inventoryNotes === 'string' ? parsed.inventoryNotes : '';

      // equipped
      if (parsed.equipped && typeof parsed.equipped === 'object') {
        for (const slot of EQUIPMENT_SLOTS) {
          const v = parsed.equipped[slot.key];
          next.equipped[slot.key] = (typeof v === 'string' && v.length) ? v : null;
        }
      }

      // settings
      if (parsed.settings && typeof parsed.settings === 'object') {
        next.settings.equipInventoryOnly = !!parsed.settings.equipInventoryOnly;
      }

      next.spellsKnown = Array.isArray(parsed.spellsKnown) ? parsed.spellsKnown.filter(x => typeof x === 'string') : [];
      next.abilitiesKnown = Array.isArray(parsed.abilitiesKnown) ? parsed.abilitiesKnown.filter(x => typeof x === 'string') : [];

      // custom content
      next.customItems = Array.isArray(parsed.customItems) ? parsed.customItems.filter(x => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string') : [];
      next.customSpells = Array.isArray(parsed.customSpells) ? parsed.customSpells.filter(x => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string') : [];
      next.customAbilities = Array.isArray(parsed.customAbilities) ? parsed.customAbilities.filter(x => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string') : [];

      character = next;
      editingCustomItemId = null;
      editingCustomSpellId = null;
      editingCustomAbilityId = null;

      buildCustomBonusGrid();
      enforceEquipInventoryOnly();
      renderAll();
      loadCustomItemIntoForm(null);
      loadCustomSpellIntoForm(null);
      loadCustomAbilityIntoForm(null);
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
