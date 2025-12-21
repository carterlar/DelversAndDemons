const statsList = ["STR","DEX","CON","INT","WIS","CHA","AGI","LCK","PER","WIL"];

let character = {
  name: "",
  race: "",
  class: "",
  level: 1,
  stats: Object.fromEntries(statsList.map(s => [s, 5])),
  inventory: [],
  equipped: {
    weapon: "",
    armor: "",
    headwear: ""
  }
};

let catalog = {};
const tierMultipliers = { S:1.0, A:0.73, B:0.5, C:0.33, E:0.15 };

fetch("items.json")
  .then(r => r.json())
  .then(data => {
    catalog = data;
    seedInventory();
    renderInventory();
    renderEquipDropdowns();
  });

let allocator = new StatAllocator(character.stats, character.level);

const statsDiv = document.getElementById("stats");
const pointsDiv = document.getElementById("points");

function renderStats() {
  statsDiv.innerHTML = "";
  statsList.forEach(stat => {
    const row = document.createElement("div");
    row.className = "stat-row";

    row.innerHTML = `
      <span>${stat}</span>
      <button>-</button>
      <span>${character.stats[stat]}</span>
      <button>+</button>
    `;

    const [minus, , plus] = row.querySelectorAll("button");

    minus.onclick = () => {
      if (allocator.decreaseStat(stat)) update();
    };
    plus.onclick = () => {
      if (allocator.increaseStat(stat)) update();
    };

    statsDiv.appendChild(row);
  });
}

function updateDerived() {
  const s = character.stats;
  const lvl = character.level;

  document.getElementById("hp").textContent =
    s.CON + lvl * 2 + Math.floor(s.WIL / 3);

  document.getElementById("mana").textContent =
    s.INT * 3 + lvl * 2;

  document.getElementById("sanity").textContent =
    Math.floor(s.WIL / 5);

  document.getElementById("ac").textContent =
    10 + Math.floor(s.STR / 15);

  document.getElementById("accuracy").textContent =
    s.PER * 2;
}

function update() {
  pointsDiv.textContent = `Points Remaining: ${allocator.remainingPoints}`;
  renderStats();
  updateDerived();
  renderInventory();
  updateBonuses();
}


function saveCharacter() {
  localStorage.setItem("character", JSON.stringify(character));
  alert("Saved");
}

function loadCharacter() {
  const data = localStorage.getItem("character");
  if (!data) return;
  character = JSON.parse(data);
  allocator = new StatAllocator(character.stats, character.level);
  syncInputs();
  update();
}

function seedInventory() {
  character.inventory = [
    ...catalog.weapons,
    ...catalog.armor,
    ...catalog.headwear
  ];
}

function renderInventory() {
  const ul = document.getElementById("inventory");
  ul.innerHTML = "";

  character.inventory.forEach(item => {
    const li = document.createElement("li");

    const stat = item.scaling_stat;
    const tier = item.tier;
    const bonus = Math.ceil(character.stats[stat] * tierMultipliers[tier]);

    li.textContent = `${item.name} [${tier}] (${stat})`;
    li.title = `+${bonus} ${item.category === "weapon" ? "Attack" : "AC"}`;

    ul.appendChild(li);
  });
}


function syncInputs() {
  ["name","race","class","level"].forEach(id => {
    document.getElementById(id).value = character[id];
  });
}

function renderEquipDropdowns() {
  ["weapon","armor","headwear"].forEach(slot => {
    const select = document.getElementById(`equip-${slot}`);
    select.innerHTML = `<option value="">None</option>`;

    character.inventory
      .filter(i => i.name)
      .forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.name;
        opt.textContent = item.name;
        select.appendChild(opt);
      });

    select.onchange = e => {
      character.equipped[slot] = e.target.value;
      updateBonuses();
    };
  });
}

function updateBonuses() {
  const lines = [];

  Object.entries(character.equipped).forEach(([slot, name]) => {
    if (!name) return;

    const item = character.inventory.find(i => i.name === name);
    if (!item) return;

    const stat = item.scaling_stat;
    const tier = item.tier;
    const mult = tierMultipliers[tier];
    const bonus = Math.ceil(character.stats[stat] * mult);

    if (slot === "weapon") lines.push(`+${bonus} Attack (${name})`);
    else lines.push(`+${bonus} AC (${name})`);
  });

  document.getElementById("bonuses").textContent =
    lines.length ? lines.join("\n") : "No bonuses";
}


["name","race","class","level"].forEach(id => {
  document.getElementById(id).addEventListener("input", e => {
    character[id] = id === "level" ? Number(e.target.value) : e.target.value;
    if (id === "level") allocator.updateLevel(character.level);
    update();
  });
});

update();
