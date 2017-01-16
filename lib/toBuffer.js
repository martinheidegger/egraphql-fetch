'use strict'

module.exports = function (input, encoding) {
  return Buffer.from ? Buffer.from(input, encoding ) : new Buffer(input, encoding)
}
