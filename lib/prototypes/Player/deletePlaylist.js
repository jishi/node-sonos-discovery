'use strict';
const logger = require('../../helpers/logger');

function deletePlaylist(name) {
  logger.debug(`deleting playlist with name ${name}`);

  if (!name) {
    throw new Error('No playlist name provided');
  }

  return this.destroyByTitle(name)
        .then((res) => {
          return {
            result: 'success'
          };
        });

}

module.exports = deletePlaylist;
