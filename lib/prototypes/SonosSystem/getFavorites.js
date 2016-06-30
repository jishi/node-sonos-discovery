'use strict';

function getFavorites() {
  return this.getAnyPlayer().browseAll('FV:2')
    .then(result => result.items);
}

module.exports = getFavorites;
