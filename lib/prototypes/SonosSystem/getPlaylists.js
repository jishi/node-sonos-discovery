'use strict';

function getPlaylists(id) {
  return this.getAnyPlayer().browseAll(id ? 'SQ:' + id : 'SQ:');
}

module.exports = getPlaylists;
