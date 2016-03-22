'use strict';

function setVolume(system, playerPresets) {
  let initialPromise = Promise.resolve();
  let players = [];

  return playerPresets.reduce((promise, playerInfo) => {
    return promise.then(() => {
      let player = system.getPlayer(playerInfo.roomName);
      players.push(player);
      return player.setVolume(playerInfo.volume);
    });
  }, initialPromise).then(() => {
    return players;
  });
}

function pauseOthers(system) {
  let initialPromise = Promise.resolve();
  return system.zones.reduce((promise, zone) => {
    return promise.then(() => {
      return zone.coordinator.pause();
    });
  }, initialPromise);
}

function groupWithCoordinator(players) {
  let initialPromise = Promise.resolve();
  let coordinator = players[0];
  let groupingUri = `x-rincon:${coordinator.uuid}`;

  // Skip first player since it is coordinator
  return players.slice(1)
    .reduce((promise, player) => {
      return promise.then(() => {
        return player.setAVTransport(groupingUri);
      });
    }, initialPromise);
}

function applyPreset(preset) {
  var promise = Promise.resolve();
  if (preset.pauseOthers) {
    promise = promise.then(() => {
      return pauseOthers(this);
    });
  }

  promise = promise.then(() => {
    return setVolume(this, preset.players);
  });

  promise = promise.then((players) => {
    return groupWithCoordinator(players);
  });

  return promise;
}

module.exports = applyPreset;
