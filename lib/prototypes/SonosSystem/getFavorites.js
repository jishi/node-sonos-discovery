'use strict';

function getFavorites() {
  let player = this.getAnyPlayer();
  return player.browse('FV:2', 0, 0)
    .then(result => result.items.filter(fav => fav.title));
}

module.exports = getFavorites;
