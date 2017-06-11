'use strict';
const logger = require('../../helpers/logger');

function importPlaylist(sqid, uri, title) {
  if (!sqid || !uri || !title) {
    throw new Error('No playlist id or title provided or no URI provided');
  };

  return this.addURIToSavedQueue(sqid, uri, title)
        .then((res) => {
          return { result: 'success', import: res };
        }).catch((err) => {
          throw new Error(err);
        });
}

module.exports = importPlaylist;

