'use strict';

function getPlaylists() {
  return this.getAnyPlayer().browseAll('SQ:');
}

module.exports = getPlaylists;
