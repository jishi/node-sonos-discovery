'use strict';
const logger = require('../../helpers/logger');
const util = require('util');

function exportPlaylist(sqid) {
  logger.debug(`exporting playlist id ${sqid}`);
  return this.system.getPlaylists(sqid)
    .then((playlist) => {
      console.log(`found playlists by id:` + sqid + '->' + playlist.map(x => console.log(util.inspect(x, false, null))));
      return playlist;
    });
}

module.exports = exportPlaylist;

