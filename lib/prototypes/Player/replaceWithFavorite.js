'use strict';
const logger = require('../../helpers/logger');

function isRadio(uri) {
  return uri.startsWith('x-sonosapi-stream:') ||
    uri.startsWith('x-sonosapi-radio:') ||
    uri.startsWith('pndrradio:') ||
    uri.startsWith('x-sonosapi-hls:') ||
    uri.startsWith('x-sonosprog-http:');
}

function replaceWithFavorite(favoriteName) {
  logger.debug(`replacing with favorite ${favoriteName}`);
  return this.system.getFavorites()
    .then((favorites) => {
      logger.debug(`found favorites`, favorites.map(x => x.title));
      return favorites.find((fav) => fav.title.toLowerCase() === favoriteName.toLowerCase() || fav.uri.toLowerCase() === favoriteName.toLowerCase());
    })
    .then((favorite) => {
      if (!favorite) {
        throw new Error('Favorite not found');
      }

      if (isRadio(favorite.uri)) {
        logger.debug(`favorite is radiostation`);
        return favorite;
      }

      logger.debug('clearing queue');
      return this.clearQueue()
        .then(() => logger.debug(`Adding ${favorite.uri} to queue with metadata ${favorite.metadata}`))
        .then(() => this.addURIToQueue(favorite.uri, favorite.metadata))
        .then(() => logger.debug(`triggering queue mode`))
        .then(() => {
          return { uri: `x-rincon-queue:${this.uuid}#0` };
        });
    })
    .then((favorite) => {
      logger.debug(`setting AVTransport to ${favorite.uri} with metadata ${favorite.metadata}`);
      if (this.avTransportUri === favorite.uri) {
        logger.debug(`already has ${favorite.uri} as AVTransport, skipping`);
        return;
      }

      return this.setAVTransport(favorite.uri, favorite.metadata);
    });
}

module.exports = replaceWithFavorite;
