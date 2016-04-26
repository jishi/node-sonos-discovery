function recalculateGroupVolume() {

  const zone = this.system.zones.find(zone => zone.uuid === this.uuid);

  const totalVolume = zone.members
    .map(player => player.state.volume)
    .reduce((prev, current) => {
      return prev + current;
    });

  this.groupState.volume = Math.round(totalVolume / zone.members.length);
}

module.exports = recalculateGroupVolume;
