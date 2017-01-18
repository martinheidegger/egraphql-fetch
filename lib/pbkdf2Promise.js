'use strict'
var crypto = require('crypto')

module.exports = function (password, salt, iterations, keylen, digest) {
  return new Promise(function (resolve, reject) {
    crypto.pbkdf2(password, salt, iterations, keylen, digest, function (error, secret) {
      error ? reject(error) : resolve(secret)
    })
  })
}
