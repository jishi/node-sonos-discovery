'use strict';

function isRadio(uri) {
  return uri.startsWith('x-sonosapi-stream:') ||
    uri.startsWith('x-sonosapi-radio:') ||
    uri.startsWith('pndrradio:');
}

function replaceWithFavorite(favoriteName) {
  return this.system.getFavorites()
    .then((favorites) => {
      return favorites.find((fav) => fav.title === favoriteName);
    }).then((favorite) => {
      if (!favorite) {
        throw new Error('Favorite not found');
      }

      if (isRadio(favorite.uri)) {
        return favorite.uri;
      }

      return this.clearQueue()
        .then(() => {
          return this.addURIToQueue(favorite.uri, favorite.metadata);
        }).then(() => {
          return `x-rincon:${this.uuid}#0`;
        });
    }).then((uri) => {
      return this.setAVTransport(uri, '');
    }).then(() => {
      return this.play();
    });
}

module.exports = replaceWithFavorite;
