'use strict';
const logger = require('../../helpers/logger');
const util = require('util');

function importPlaylist(sqid,uri,title) {
  console.log("importPlaylist:" + sqid + ',' + uri + ',' + title);
  if(!sqid || !uri) {
    throw new Error('No playlist id or uri provided');
  };

      return this.addURIToSavedQueue(sqid, uri, title)
        .then((res) => {
          console.log("importPlaylist res:", res);
          return { out : res };
        });
}

module.exports = importPlaylist;

