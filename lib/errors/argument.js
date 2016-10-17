'use strict';

class ArgumentError extends Error {
  constructor(m) {
    super(m);
  }
}

module.exports = ArgumentError;
