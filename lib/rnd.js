'use strict'

const simpleRandom = require('simple-random')
module.exports = function () {
  return simpleRandom({
    secure: simpleRandom.isSecureSupported
  })
}
