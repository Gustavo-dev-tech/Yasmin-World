export class Storage {
  static getMoney() {
    const val = localStorage.getItem('game_money');
    return val ? parseInt(val, 10) : 0;
  }

  static addMoney(amount) {
    const current = this.getMoney();
    const updated = Math.max(0, current + amount);
    localStorage.setItem('game_money', updated.toString());
    return updated;
  }

  static getParkourBestTime() {
    const val = localStorage.getItem('game_parkour_best');
    return val ? parseFloat(val) : null;
  }

  static saveParkourTime(seconds) {
    const current = this.getParkourBestTime();
    if (!current || seconds < current) {
      localStorage.setItem('game_parkour_best', seconds.toFixed(2));
      return true;
    }
    return false;
  }

  static getControlWins() {
    const val = localStorage.getItem('game_cp_wins');
    return val ? parseInt(val, 10) : 0;
  }

  static addControlWin() {
    const current = this.getControlWins();
    localStorage.setItem('game_cp_wins', (current + 1).toString());
  }
}