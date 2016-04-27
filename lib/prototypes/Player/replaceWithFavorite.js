'use strict';

function isRadio(uri) {
  return uri.startsWith('x-sonosapi-stream:') ||
    uri.startsWith('x-sonosapi-radio:') ||
    uri.startsWith('pndrradio:');
}

function replaceWithFavorite(favoriteName) {
  return this.system.getFavorites()
    .then((favorites) => favorites.find((fav) => fav.title.toLowerCase() === favoriteName.toLowerCase()))
    .then((favorite) => {
      if (!favorite) {
        throw new Error('Favorite not found');
      }

      if (isRadio(favorite.uri)) {
        return favorite.uri;
      }

      return this.clearQueue()
        .then(() => this.addURIToQueue(favorite.uri, favorite.metadata))
        .then(() => `x-rincon-queue:${this.uuid}#0`);
    })
    .then((uri) => this.setAVTransport(uri, ''))
    .then(() => this.play());
}

module.exports = replaceWithFavorite;
