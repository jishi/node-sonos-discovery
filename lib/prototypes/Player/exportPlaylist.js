'use strict';
const logger = require('../../helpers/logger');

function exportPlaylist(sqid) {
  logger.debug(`exporting playlist id ${sqid}`);
  return this.system.getPlaylists(sqid)
    .then((playlist) => {
      return playlist;
    });
}

module.exports = exportPlaylist;

