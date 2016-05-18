'use strict';

function getFavorites() {
  let player = this.getAnyPlayer();
  return player.browse('FV:2', 0, 0)
    .then(result => result.items);
}

module.exports = getFavorites;
