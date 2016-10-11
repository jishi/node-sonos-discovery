'use strict';
const logger = require('../../helpers/logger');

function replaceWithPlaylist(playlistName) {
  logger.debug(`replacing with playlist ${playlistName}`);
  return this.system.getPlaylists()
    .then((playlists) => {
      logger.debug(`found playlists`, playlists.map(x => x.title));
      return playlists.find((list) => list.title.toLowerCase() === playlistName.toLowerCase());
    })
    .then((playlist) => {
      if (!playlist) {
        throw new Error('Playlist not found');
      }

      logger.debug('clearing queue');
      return this.clearQueue()
        .then(() => logger.debug(`Adding ${playlist.uri} to queue`))
        .then(() => this.addURIToQueue(playlist.uri, ''))
        .then(() => logger.debug(`triggering queue mode`))
        .then(() => {
          return { uri: `x-rincon-queue:${this.uuid}#0` };
        });
    })
    .then((playlist) => {
      logger.debug(`setting AVTransport to ${playlist.uri} `);
      return this.setAVTransport(playlist.uri, '');
    });
}

module.exports = replaceWithPlaylist;
