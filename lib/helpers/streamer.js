'use strict';
const Readable = require('stream').Readable;

function streamer(str) {
  let mockedStream = new Readable();

  // Avoid not implemented warning
  mockedStream._read = function noop() {
  };

  setImmediate(() => {
    mockedStream.push(str);
    mockedStream.push(null);
  });

  return mockedStream;
}

module.exports = streamer;
