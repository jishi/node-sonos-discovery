'use strict';
const logger = require('../../helpers/logger');
const util = require('util');

function exportPlaylist(sqid) {
  logger.debug(`exporting with playlist id ${sqid}`);
  console.log(`exporting with playlist id ${sqid}`);
  return this.system.getPlaylists(sqid)
    .then((playlists) => {
      console.log(`found playlists by id:` + sqid + "->" + playlists.map(x => console.log(util.inspect(x, false, null))));
      //return playlists.find((list) => list.title.toLowerCase() === playlistName.toLowerCase());
      //console.log("1->" + playlists);
      //console.log("2->" + playlists.map(x => console.log(util.inspect(x, false, null))));
      //playlists.map(x => console.log("exportPlaylistId map:" + util.inspect(x, false, null)));
      return playlists;
    });
}

module.exports = exportPlaylist;

