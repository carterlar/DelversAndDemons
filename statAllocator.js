class StatAllocator {
  constructor(stats, level) {
    this.stats = stats;
    this.level = level;
    this.maxPoints = level * 5;
    this.remainingPoints = this.calculateRemaining();
  }

  calculateRemaining() {
    const spent = Object.values(this.stats).reduce((a, b) => a + b, 0);
    return this.maxPoints - spent;
  }

  updateLevel(level) {
    this.level = level;
    this.maxPoints = level * 5;
    this.remainingPoints = this.calculateRemaining();
  }

  increaseStat(stat) {
    if (this.remainingPoints <= 0) return false;
    this.stats[stat]++;
    this.remainingPoints--;
    return true;
  }

  decreaseStat(stat) {
    if (this.stats[stat] <= 5) return false;
    this.stats[stat]--;
    this.remainingPoints++;
    return true;
  }
}
