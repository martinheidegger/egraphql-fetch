'use strict'

if (!Buffer.from) {
  Buffer.from = function (input, encoding) {
    return new Buffer(input, encoding)
  }
}
