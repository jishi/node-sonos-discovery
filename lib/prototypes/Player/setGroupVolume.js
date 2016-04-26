'use strict';
function setGroupVolume(desiredVolume) {
  const currentGroupVolume = this.groupState.volume;
  let deltaVolume;

  // If prefixed with + or -
  if (/^[+-]/.test(desiredVolume)) {
    deltaVolume = parseInt(desiredVolume);
    desiredVolume = currentGroupVolume + parseInt(desiredVolume);
  } else {
    desiredVolume = parseInt(desiredVolume);
    deltaVolume = desiredVolume - currentGroupVolume;
  }

  const zone = this.system.zones.find(zone => zone.uuid === this.uuid);

  const promises = zone.members.map((player) => {
    let targetVolume;
    if (desiredVolume < 1) {
      targetVolume = 0;
    } else if (deltaVolume > 0) {
      targetVolume = player.state.volume + deltaVolume;
    } else {
      var factor = player.state.volume / currentGroupVolume;
      targetVolume = Math.ceil(factor * desiredVolume);
    }

    // Update internal state instantly to recalculate correctly
    player._setVolume(targetVolume);
    return player.setVolume(targetVolume);

  });

  this.groupState.volume = desiredVolume;

  return Promise.all(promises);

}

module.exports = setGroupVolume;
