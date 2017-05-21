'use strict';
const logger = require('../../helpers/logger');

function createPlaylist(title) {
  logger.debug(`creating playlist with name ${title}`);

  if (!title) {
    throw new Error('No playlist name provided');
  }

  return this.createSavedQueue(title)
        .then((res) => {
          return {
            result: 'success',
            sqid: res.assignedobjectid.replace(/SQ:/, '')
          };
        });
}

module.exports = createPlaylist;

