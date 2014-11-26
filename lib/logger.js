var logger = exports; exports.constructor = function logger(){};

var winston = require('winston');

var LOG_LEVEL = process.env.NODE_ENV === 'development' ? 'info' : 'error';

logger.initialize = function() {
  var client = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({ level: LOG_LEVEL })
    ]
  });

  // Override the log level from the process env
  if (process.env.DISCOVERY_LOG_LEVEL) {
    client.transports.console.level = process.env.DISCOVERY_LOG_LEVEL;
  }

  logger.client = client;

  return logger.client;
};
