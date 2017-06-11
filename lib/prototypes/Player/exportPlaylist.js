'use strict';
const logger = require('../../helpers/logger');

function exportPlaylist(id) {
  logger.debug(`exporting playlist using id ${id}`);
  if (id) {
    return this.system.getPlaylists()
    .then((playlists) => {
        let match;
        for (var i = playlists.length - 1; i >= 0; i--) {
          const playlist = playlists[i];
          if (playlist.title.toLowerCase() === id.toLowerCase()) {
            match = playlist;
            break;
          }
        };

        return match || {};
      })
    .then((playlist) => {
            const ptitle = playlist.title;
            if (ptitle === undefined) {
              return {};
            }

            const psqid = playlist.sqid;
            return this.system.getPlaylists(psqid)
                .then((playlist) => {
                playlist.title = ptitle;
                playlist.sqid = psqid;
                return {
                    title: ptitle,
                    sqid: psqid,
                    items: playlist
                  };
              });
          });
  }

  return this.system.getPlaylists(id)
    .then((playlist) => {
      return playlist;
    });
}

module.exports = exportPlaylist;

