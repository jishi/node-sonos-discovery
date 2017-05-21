'use strict';
const logger = require('../../helpers/logger');
const util = require('util');

function createPlaylist(title) {
  console.log("createplaylist:" + title);
  if(!title) {
    throw new Error('No playlist name provided');
  }
      return this.createSavedQueue(title)
        .then((res) => {
          console.log("createPlaylist res:", res);
          return { sqid: res.assignedobjectid };
        });
}

module.exports = createPlaylist;

