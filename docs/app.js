const CORE_STATS = ['STR','DEX','CON','INT','WIS','CHA','AGI','LCK','PER','WIL'];
const STARTING_POINTS = 50;
const POINTS_PER_LEVEL = 8;

let titles = [];
let spells = [];
let abilities = [];

let character = newCharacter();
let currentTab = 'stats';

/* --------------------
   Character Model
-------------------- */
function newCharacter() {
  return {
    meta: { app: 'Homebrew Character Tracker', version: '1.0' },
    name: 'New Adventurer',
    titleId: 'none',
    level: 1,
    availablePoints: STARTING_POINTS,
    stats: Object.fromEntries(CORE_STATS.map(s => [s, 10])),
    spellsKnown: [],      // store IDs only
    abilitiesKnown: []    // store IDs only
  };
}

/* --------------------
   Derived Stats
-------------------- */
function calculateDerived(c) {
  const s = c.stats || {};
  const lvl = Number(c.level || 1);

  const CON = Number(s.CON || 0);
  const WIL = Number(s.WIL || 0);
  const INT = Number(s.INT || 0);
  const PER = Number(s.PER || 0);
  const STR = Number(s.STR || 0);

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
  const [t, sp, ab] = await Promise.all([
    fetchJson('data/titles.json'),
    fetchJson('data/spells.json'),
    fetchJson('data/abilities.json')
  ]);
  titles = t;
  spells = sp;
  abilities = ab;
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

  // Learn buttons
  document.getElementById('learnSpellBtn').addEventListener('click', () => {
    const id = document.getElementById('spellPick').value;
    learnSpell(id);
    renderAll();
  });

  document.getElementById('learnAbilityBtn').addEventListener('click', () => {
    const id = document.getElementById('abilityPick').value;
    learnAbility(id);
    renderAll();
  });
}

/* --------------------
   Tabs
-------------------- */
function setTab(tab) {
  currentTab = tab;

  document.querySelectorAll('.tabBtn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  ['stats','spells','abilities'].forEach(t => {
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
  renderDerived();

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

  CORE_STATS.forEach(stat => {
    const row = document.createElement('div');
    row.className = 'stat';

    const label = document.createElement('span');
    label.textContent = stat;

    const value = document.createElement('span');
    value.textContent = String(character.stats[stat]);

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
   Spells + Abilities
-------------------- */
function renderSpellPicker() {
  const select = document.getElementById('spellPick');
  select.innerHTML = '';

  const unknowns = getUnknownIds(character.spellsKnown, spells);

  const available = spells
    .filter(s => !character.spellsKnown.includes(s.id))
    .sort((a,b) => a.name.localeCompare(b.name));

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

  // show unknown known IDs (from old saves) as informational only
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
    .sort((a,b) => a.name.localeCompare(b.name));

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
      id,
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
      id,
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

/* --------------------
   Learn / Forget
-------------------- */
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
   Core Logic
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
   Save / Load (File-based)
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

      // Minimal validation + normalization
      const next = newCharacter();
      next.name = typeof parsed.name === 'string' ? parsed.name : next.name;
      next.titleId = typeof parsed.titleId === 'string' ? parsed.titleId : next.titleId;
      next.level = safeNumber(parsed.level, next.level);
      next.availablePoints = safeNumber(parsed.availablePoints, next.availablePoints);

      next.stats = { ...next.stats };
      if (parsed.stats && typeof parsed.stats === 'object') {
        for (const k of CORE_STATS) {
          const v = Number(parsed.stats[k]);
          if (Number.isFinite(v)) next.stats[k] = v;
        }
      }

      // spells/abilities IDs only
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

function safeNumber(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
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
