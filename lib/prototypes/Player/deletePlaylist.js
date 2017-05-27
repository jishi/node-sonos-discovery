'use strict';
const logger = require('../../helpers/logger');

function deletePlaylist(sqid) {
  logger.debug(`deleting playlist with id ${sqid}`);

  if (!sqid) {
    throw new Error('No playlist id provided');
  }

  return this.destroyObject('SQ:' + sqid)
        .then((res) => {
          return {
            result: 'success'
          };
        });
}

module.exports = deletePlaylist;

