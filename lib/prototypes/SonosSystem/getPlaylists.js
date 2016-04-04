'use strict';

function isFinished(chunk) {
  return chunk.startIndex + chunk.numberReturned >= chunk.totalMatches;
}

function getPlaylists() {
  let player = this.getAnyPlayer();

  let result = {
    items: [],
    startIndex: 0,
    numberReturned: 0,
    totalMatches: 1
  };

  let getChunk = (chunk) => {
    Array.prototype.push.apply(result.items, chunk.items);
    result.numberReturned += chunk.numberReturned;
    result.totalMatches = chunk.totalMatches;

    if (isFinished(chunk)) {
      return result;
    }

    // Recursive promise chain
    return player.browse('SQ:', chunk.startIndex + chunk.numberReturned, 0)
      .then(getChunk);
  };

  return Promise.resolve(result)
    .then(getChunk);

}

module.exports = getPlaylists;
