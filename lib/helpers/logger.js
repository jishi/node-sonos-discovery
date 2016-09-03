const util = require('util');

const LOG_LEVEL = Object.freeze({
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50
});

function isValidLevel(level) {
  const configuredLogLevel = process.env.NODE_LOG_LEVEL || 'info';
  return LOG_LEVEL[level] >= LOG_LEVEL[configuredLogLevel.toUpperCase()];
}

function log(level) {
  if (!isValidLevel(level)) {
    return;
  }

  const args = Array.from(arguments).slice(1);
  const errors = args.filter(x => x instanceof Error);
  const objects = args.filter(x => !(x instanceof Error) && x instanceof Object);
  const message = args.filter(x => !(x instanceof Object)).join(' ');
  const output = [
    new Date().toISOString(),
    level,
    message
  ];

  console.log(output.join(' '));
  errors.forEach(x => console.log('  ' + x.stack));
  objects.forEach(x => console.log('  ' + util.inspect(x)));
}

const logger = {
  trace: log.bind(null, 'TRACE'),
  debug: log.bind(null, 'DEBUG'),
  info: log.bind(null, 'INFO'),
  warn: log.bind(null, 'WARN'),
  error: log.bind(null, 'ERROR')
};

module.exports = logger;
