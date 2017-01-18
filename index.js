'use strict'

/* global Headers, fetch */
require('isomorphic-fetch')

var defaults = require('101/defaults')
var createCrypto = require('./lib/createCrypto.js')
var rnd = require('./lib/rnd.js')
var isRedirect = require('./lib/isRedirect.js')
var pbkdf2Promise = require('./lib/pbkdf2Promise.js')
var toBuffer = require('./lib/toBuffer.js')

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
  var crypto = createCrypto(cipherAlgorithm, privateKey, cipherPad)
  var prepareHeaders = function (headers, session) {
    // Override the cipher & keyID & content-transfer-encoding,
    // to make sure that the correct cipher is set
    headers.set('x-cipher', cipherAlgorithm)
    headers.set('x-key-id', session ? session.keyID : keyID)
    headers.set('content-transfer-encoding', 'base64')
    headers.set('content-type', 'application/egraphql')
    return headers
  }

  var fetchSession = function fetchSession () {
    var request = fetch(graphqlUrl, {
      headers: prepareHeaders(new Headers()),
      method: 'POST',
      body: crypto.cipher(JSON.stringify({
        id: factory.id() + '#session',
        payload: {
          query: 'mutation session { eGraphQLSession { keyID, secret } }'
        }
      }))
    }).then(function (res) {
      var contentType = res.headers.get('content-type')
      if (res.status === 200 && contentType === 'application/egraphql') {
        return res.text()
          .then(function (text) {
            return JSON.parse(crypto.decipher(text)).payload.data.eGraphQLSession
          })
          .then(function (session) {
            if (!session) {
              return null
            }
            return pbkdf2Promise(privateKey, toBuffer(session.secret), 100000, 256, 'sha512')
              .then(function (sessionPrivateKey) {
                session.privateKey = sessionPrivateKey
                return session
              })
          })
      }
      return null
    }).catch(function () {
      // Eat errors
      return null
    }).then(function (session) {
      getSession = function repeatRequestSession () {
        // Resolve future session requests with the new session
        return Promise.resolve(session)
      }
      return session
    })
    getSession = function parallelRequestSession () {
      // Support parallel session requests
      return request
    }
    return request
  }
  var getSession = fetchSession

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

    if (!opts.redirect) {
      opts.redirect = 'error'
    }

    if (!opts.id) {
      opts.id = factory.id()
    }

    return getSession()
      .then(function (session) {
        prepareHeaders(opts.headers, session)

        opts.body = crypto.cipher(JSON.stringify({
          id: opts.id,
          payload: {
            query: query,
            variables: variables || {}
          }
        }), session && session.privateKey)

        return fetch(graphqlUrl, opts)
          .then(function (res) {
            var contentType = res.headers.get('content-type')
            if (res.status === 200 && contentType !== 'application/egraphql') {
              var err = new Error(
                'Wrong response content-type: "' + contentType + '". ' +
                'Is this an egraphql endpoint?'
              )
              err.code = 'EHTTPCONTENTTYPE'
              err.contentType = contentType
              return Promise.reject(err)
            }
            return res.text()
              .then(function (text) {
                // fetch will resolve all redirect if the redirect option is not
                // 'error'. If a redirect is still arriving then the redirect needs
                // to be handled manually. We shouldn't just "resolve" it because
                // mean we resolve with data. Thus sending a proper reject error
                // is clearer
                if (isRedirect(res.status)) {
                  var redirectErr = new Error('HTTP redirect: ' + res.status + '\n' + text)
                  redirectErr.code = 'EHTTPREDIRECT'
                  redirectErr.status = res.status
                  redirectErr.location = res.headers.get('location')
                  redirectErr.text = text
                  return Promise.reject(redirectErr)
                }
                if (res.status !== 200) {
                  var err = new Error('HTTP status: ' + res.status + '\n' + text)
                  err.code = 'EHTTPSTATUS'
                  err.status = res.status
                  err.text = text
                  return Promise.reject(err)
                }
                return crypto.decipher(text, session && session.privateKey)
              })
              .then(function (data) {
                return JSON.parse(data).payload
              })
          })
      })
  }
}

module.exports.id = function () {
  return (new Date().toISOString()) + '_' + rnd()
}
