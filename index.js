'use strict'

/* global Headers, fetch */
require('isomorphic-fetch')

var defaults = require('101/defaults')
var crypto = require('crypto')
var createPad = require('./lib/pad.js')
var toBuffer = require('./lib/toBuffer.js')
var rnd = require('./lib/rnd.js')

/**
 * create a graphql-fetch bound to a specific graphql url
 * @param  {String} graphqlUrl
 * @param  {String} keyId ID that allows the server to identify the source
 * @param  {String} privateKey Private Key used to encrypt the request
 * @param  {String} cipherAlgorithm Cipher algorithm used for the transport,
 *                                  Default algorithm is aes256.
 * @param  {int}    cipherPad pad input data to the next bigger multiple length
 *                            of the given integer. To counteract traffic
 *                            analysis.
 *                            By default it pads to 1024.
 *                            This needs to be a multiple of the chosen
 *                            cipherAlgorithms base encryption.
 * @return {Function} graphqlFetch
 */
module.exports = function factory (graphqlUrl, keyID, privateKey, cipherAlgorithm, cipherPad) {
  if (!graphqlUrl) {
    var err = new Error('graphqlUrl missing')
    err.code = 'EURLMISSING'
    throw err
  }
  if (!cipherAlgorithm) {
    cipherAlgorithm = 'aes256'
  }
  var pad = createPad(cipherPad || 1024)
  var cipher = function (data) {
    data = pad(data)
    var c = crypto.createCipher(cipherAlgorithm, privateKey)
    return Buffer.concat([
      c.update(data),
      c.final()
    ]).toString('base64')
  }
  var decipher = function (data) {
    var d = crypto.createDecipher(cipherAlgorithm, privateKey)
    return Buffer.concat([
      d.update(toBuffer(data, 'base64')),
      d.final()
    ]).toString('utf8')
  }

  /**
   * graphql fetch - fetch w/ smart defaults for graphql requests
   * @param  {Query} query graphql query
   * @param  {Object} variables  graphql query variables
   * @param  {Object} opts  fetch options
   * @return {FetchPromise} fetch promise
   */
  return function graphqlFetch (query, variables, opts) {
    if (!query) {
      var err = new Error('query is required')
      err.code = 'EQUERYMISSING'
      return Promise.reject(err)
    }
    opts = opts || {}

    defaults(opts, {
      method: 'POST',
      headers: new Headers()
    })

    var headers = opts.headers

    // Override the cipher & keyID & content-transfer-encoding,
    // to make sure that the correct cipher is set
    headers.set('x-cipher', cipherAlgorithm)
    headers.set('x-key-id', keyID)
    headers.set('content-transfer-encoding', 'base64')

    // Do allow a different content-type
    if (!headers.get('content-type')) {
      headers.append('content-type', 'application/json')
    }

    var id
    if (opts.id) {
      id = opts.id
      delete opts.id
    } else {
      id = factory.id()
    }

    opts.body = cipher(JSON.stringify({
      id: id,
      payload: {
        query: query,
        variables: variables || {}
      }
    }))

    return fetch(graphqlUrl, opts)
      .then(function (res) {
        return res.text()
          .then(function (text) {
            if (res.status !== 200) {
              var err = new Error('HTTP status: ' + res.status + '\n' + text)
              err.code = 'EHTTPSTATUS'
              err.status = res.status
              err.text = text
              return Promise.reject(err)
            }
            return decipher(text)
          })
      })
      .then(function (data) {
        return JSON.parse(data).payload
      })
  }
}

module.exports.id = function () {
  return (new Date().toISOString()) + '_' + rnd()
}
