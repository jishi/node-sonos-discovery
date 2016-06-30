'use strict';

function getPlaylists() {
  return this.getAnyPlayer().browseAll('SQ:')
    .then(result => result.items);
}

module.exports = getPlaylists;
