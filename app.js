const statsList = ["STR","DEX","CON","INT","WIS","CHA","AGI","LCK","PER","WIL"];

let character = {
  name: "",
  race: "",
  class: "",
  level: 1,
  stats: Object.fromEntries(statsList.map(s => [s, 5])),
  inventory: [],
  spells: [],
  abilities: [],
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

function populateStatSelects() {
  document.querySelectorAll("#catalog-stat, #custom-stat").forEach(sel => {
    sel.innerHTML = "";
    statsList.forEach(stat => {
      const opt = document.createElement("option");
      opt.value = stat;
      opt.textContent = stat;
      sel.appendChild(opt);
    });
  });
}

populateStatSelects();


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
  renderList(character.spells, "spells");
  renderList(character.abilities, "abilities");
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

function renderList(list, elementId) {
  const ul = document.getElementById(elementId);
  ul.innerHTML = "";

  list.forEach(item => {
    const li = document.createElement("li");

    const stat = item.scaling_stat;
    const tier = item.tier;
    const bonus = Math.ceil(character.stats[stat] * tierMultipliers[tier]);

    li.textContent = `${item.name} [${tier}] (${stat})`;
    li.title = item.flavor || `+${bonus}`;

    ul.appendChild(li);
  });
}

function updateCatalogList() {
  const category = document.getElementById("catalog-category").value;
  const search = document.getElementById("catalog-search").value.toLowerCase();
  const select = document.getElementById("catalog-select");

  select.innerHTML = "";

  (catalog[category] || [])
    .filter(i => i.name.toLowerCase().includes(search))
    .forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.name;
      opt.textContent = item.name;
      select.appendChild(opt);
    });
}

["catalog-category","catalog-search"].forEach(id => {
  document.getElementById(id).addEventListener("input", updateCatalogList);
});

updateCatalogList();

document.getElementById("add-from-catalog").onclick = () => {
  const category = document.getElementById("catalog-category").value;
  const name = document.getElementById("catalog-select").value;
  const stat = document.getElementById("catalog-stat").value;
  const tier = document.getElementById("catalog-tier").value;

  if (!name) return;

  const base = catalog[category].find(i => i.name === name);
  if (!base) return;

  const item = {
    ...base,
    scaling_stat: stat,
    tier
  };

  const bonus = Math.ceil(character.stats[stat] * tierMultipliers[tier]);
  item.flavor = item.flavor || `+${bonus}`;

  character[category].push(item);
  update();
};

document.getElementById("create-custom").onclick = () => {
  const name = document.getElementById("custom-name").value.trim();
  const type = document.getElementById("custom-type").value;
  const stat = document.getElementById("custom-stat").value;
  const tier = document.getElementById("custom-tier").value;
  const flavor = document.getElementById("custom-flavor").value;

  if (!name) return;

  const item = {
    name,
    scaling_stat: stat,
    tier,
    flavor
  };

  character[type].push(item);
  update();
};


document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

character.spells.push({
  name: "Fireball",
  scaling_stat: "INT",
  tier: "A",
  flavor: "Deals massive fire damage."
});

character.abilities.push({
  name: "Power Strike",
  scaling_stat: "STR",
  tier: "B",
  flavor: "A heavy melee attack."
});


update();
