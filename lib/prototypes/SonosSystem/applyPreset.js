'use strict';
const logger = require('../../helpers/logger');
require('../../polyfills/Array.includes');

function setVolume(system, playerPresets) {
  let initialPromise = Promise.resolve();

  return playerPresets.reduce((promise, playerInfo) => {
    let player = system.getPlayer(playerInfo.roomName);
    if (!player) {
      return promise;
    }

    return promise.then(() => {
      if (playerInfo.hasOwnProperty('volume')) {
        logger.debug(`setting volume ${playerInfo.volume} on ${player.roomName}`);
        return player.setVolume(playerInfo.volume);
      }
    })
      .then(() => {
        if (playerInfo.hasOwnProperty('mute')) {
          logger.debug(`setting mute state ${playerInfo.mute} on ${player.roomName}`);
          const muteFunc = playerInfo.mute ? player.mute.bind(player) : player.unMute.bind(player);
          return muteFunc();
        }
      });
  }, initialPromise);
}

function pauseOthers(system, presetPlayers) {
  const presetPlayerUuids = presetPlayers.map(player => player.uuid);

  const initialPromise = Promise.resolve();
  return system.zones
    .filter(zone => presetPlayerUuids.includes(zone.uuid) === false)
    .reduce((promise, zone) => {
      return promise.then(() => {
        logger.debug(`pausing ${zone.coordinator.roomName}`);
        return zone.coordinator.pause()
          .catch((err) => {
          });
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

      if (player.avTransportUri === groupingUri) {
        logger.debug(`skipping grouping for ${player.roomName} because it is already grouped with coordinator`);
        return promise;
      }

      logger.debug(`adding ${player.roomName} to coordinator ${coordinator.roomName}`);
      return promise.then(() => player.setAVTransport(groupingUri));
    }, initialPromise);
}

function ungroupFromCoordinator(system, players) {
  // Find zone
  let coordinator = players[0];
  let zone = system.zones.find((x) => {
    return x.uuid === coordinator.uuid;
  });

  let playerNames = players.map((player) => {
    return player.roomName;
  });
  let superfluousPlayers = zone.members.filter((member) => {
    return playerNames.indexOf(member.roomName) === -1;
  });

  return superfluousPlayers.reduce((promise, player) => {
    logger.debug(`ungrouping ${player.roomName} from coordinator ${coordinator.roomName}`);
    return promise.then(() => player.becomeCoordinatorOfStandaloneGroup());
  }, Promise.resolve());

}

function applyPreset(preset) {
  let promise = Promise.resolve();
  let players;
  let coordinator;

  promise = promise.then(() => {
    players = preset.players.map(playerInfo => this.getPlayer(playerInfo.roomName));
  });

  promise = promise.then(() => {
    // store coordinator for future use
    coordinator = players[0];
    logger.debug(`coordinator is ${coordinator.roomName}`);

    // If the first player needs to be broken out, do that before we group the other players with it.
    if (coordinator.coordinator.uuid !== coordinator.uuid) {
      logger.debug(`breaking out ${coordinator.roomName} because player is part of group`);
      return coordinator.becomeCoordinatorOfStandaloneGroup()
        .then(() => groupWithCoordinator(players));
    }

    if (players.length === 1 && coordinator.avTransportUri !== preset.uri) {
      logger.debug(`breaking out ${coordinator.roomName} because player is coordinator of group and uri differs`);
      return coordinator.becomeCoordinatorOfStandaloneGroup()
        .then(() => groupWithCoordinator(players));
    }

    return groupWithCoordinator(players).then(() => {
      // This only needs to happen if we didn't ungroup the coordinator
      return ungroupFromCoordinator(this, players);
    });
  });

  if (preset.pauseOthers) {
    promise = promise.then(() => pauseOthers(this, players));
  }

  if (preset.favorite) {
    promise = promise.then(() => coordinator.replaceWithFavorite(preset.favorite));
  } else if (preset.playlist) {
    promise = promise.then(() => coordinator.replaceWithPlaylist(preset.playlist));
  } else if (preset.uri) {
    promise = promise.then(() => coordinator.setAVTransport(preset.uri, preset.metadata));
  }

  promise = promise.then(() => setVolume(this, preset.players));

  if (preset.playMode) {
    promise = promise.then(() => coordinator.setPlayMode(preset.playMode)
      .catch(err => logger.warn(err, 'setPlayMode failed')));
  }

  if (preset.trackNo) {
    promise = promise.then(() => coordinator.trackSeek(preset.trackNo)
      .catch(err => logger.warn(err, 'trackSeek failed')));
  }

  if (preset.elapsedTime) {
    promise = promise.then(() => coordinator.timeSeek(preset.elapsedTime)
      .catch(err => logger.warn(err, 'timeSeek failed')));
  }

  if (preset.sleep) {
    promise = promise.then(() => coordinator.sleep(preset.sleep));
  }

  if (!preset.state || preset.state.toLowerCase() === 'playing') {
    promise = promise.then(() => coordinator.play());
  }

  return promise;
}

module.exports = applyPreset;
