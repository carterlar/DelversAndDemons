const statsList = ["STR","DEX","CON","INT","WIS","CHA","AGI","LCK","PER","WIL"];

let character = {
  name: "",
  race: "",
  class: "",
  level: 1,
  stats: Object.fromEntries(statsList.map(s => [s, 5]))
};

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

function syncInputs() {
  ["name","race","class","level"].forEach(id => {
    document.getElementById(id).value = character[id];
  });
}

["name","race","class","level"].forEach(id => {
  document.getElementById(id).addEventListener("input", e => {
    character[id] = id === "level" ? Number(e.target.value) : e.target.value;
    if (id === "level") allocator.updateLevel(character.level);
    update();
  });
});

update();
