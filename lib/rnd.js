'use strict'

var simpleRandom = require('simple-random')
module.exports = function () {
  return simpleRandom({
    secure: simpleRandom.isSecureSupported
  })
}
