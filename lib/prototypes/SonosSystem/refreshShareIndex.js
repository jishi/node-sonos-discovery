'use strict';

function refreshShareIndex() {
  let player = this.getAnyPlayer();
  return player.refreshShareIndex();
}

module.exports = refreshShareIndex;
