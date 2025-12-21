const CORE_STATS = ['STR','DEX','CON','INT','WIS','CHA','AGI','LCK','PER','WIL'];
const STARTING_POINTS = 50;
const POINTS_PER_LEVEL = 8;

function calculateDerived(c) {
  const s = c.stats;
  const lvl = c.level;

  return {
    HP: s.CON + (lvl * 2) + Math.floor(s.WIL / 3),
    Mana: (s.INT * 3) + (lvl * 2),
    Sanity: Math.floor(s.WIL / 5),
    AC: (10 + (s.STR / 15)).toFixed(2),
    Accuracy: s.PER * 2,
    DOTRes: (s.CON / 15).toFixed(2)
  };
}

let titles = [];
let character = newCharacter();

/* --------------------
   Character Model
-------------------- */
function newCharacter() {
  return {
    name: 'New Adventurer',
    titleId: 'none',
    level: 1,
    availablePoints: STARTING_POINTS,
    stats: Object.fromEntries(CORE_STATS.map(s => [s, 10]))
  };
}

/* --------------------
   Init
-------------------- */
async function init() {
  await loadTitles();
  bindUI();
  renderAll();
}

async function loadTitles() {
  const res = await fetch('data/titles.json');
  titles = await res.json();
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

  document.getElementById('levelUpBtn').addEventListener('click', levelUp);
  document.getElementById('saveBtn').addEventListener('click', saveCharacter);

  document.getElementById('importInput').addEventListener('change', importCharacter);
}

/* --------------------
   Rendering
-------------------- */
function renderAll() {
  renderTitles();
  renderStats();
  renderMeta();
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

  select.value = character.titleId;
}

function renderStats() {
  const container = document.getElementById('statsContainer');
  container.innerHTML = '';

  CORE_STATS.forEach(stat => {
    const row = document.createElement('div');
    row.className = 'stat';

    row.innerHTML = `
      <span>${stat}</span>
      <span>${character.stats[stat]}</span>
      <button>+1</button>
    `;

    row.querySelector('button').onclick = () => incrementStat(stat);
    container.appendChild(row);
  });
}

function renderMeta() {
  document.getElementById('levelDisplay').textContent = character.level;
  document.getElementById('pointsDisplay').textContent = character.availablePoints;
  document.getElementById('charName').value = character.name;
}

/* --------------------
   Logic
-------------------- */
function incrementStat(stat) {
  if (character.availablePoints <= 0) return;
  character.stats[stat]++;
  character.availablePoints--;
  renderMeta();
  renderStats();
}

function levelUp() {
  character.level++;
  character.availablePoints += POINTS_PER_LEVEL;
  renderMeta();
}

/* --------------------
   Save / Load
-------------------- */
function saveCharacter() {
  const data = JSON.stringify(character, null, 2);
  const blob = new Blob([data], { type: 'application/json' });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${character.name || 'character'}.hb.json`;
  a.click();
}

function importCharacter(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    character = JSON.parse(reader.result);
    renderAll();
  };
  reader.readAsText(file);
}

init();

