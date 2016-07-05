'use strict';

function getFavorites() {
  return this.getAnyPlayer().browseAll('FV:2');
}

module.exports = getFavorites;
