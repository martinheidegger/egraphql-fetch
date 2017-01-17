'use strict'

// From node-fetch
module.exports = function (code) {
  return code === 301 || code === 302 || code === 303 || code === 307 || code === 308
}
