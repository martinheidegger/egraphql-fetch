'use strict'

/* global Headers, Response */
require('isomorphic-fetch')

var test = require('blue-tape').test

var sinon = require('sinon')
var crypto = require('crypto')
require('sinon-as-promised')

var graphqlUrl = 'http://host/graphql'
var graphqlFactory = require('../index.js')
var toBuffer = require('../lib/toBuffer.js')

function _encrypt (cipher, key, pad, data, sessionPrivateKey) {
  var c = crypto.createCipher(cipher, sessionPrivateKey || key)
  data = JSON.stringify(data)
  var missing = pad - (data.length % pad)
  for (var i = 0; i < missing; i++) {
    data += ' '
  }
  return Buffer.concat([
    c.update(data),
    c.final()
  ]).toString('base64')
}

function _decrypt (cipher, key, data, sessionPrivateKey) {
  var d = crypto.createDecipher(cipher, sessionPrivateKey || key)
  return JSON.parse(Buffer.concat([
    d.update(toBuffer(data, 'base64')),
    d.final()
  ]).toString())
}

function testRequest (t, request, response, handleRequest) {
  var encrypt = _encrypt.bind(null, request.cipherAlgorithm || 'aes256', request.privateKey, request.cipherPad || 1024)
  var decrypt = _decrypt.bind(null, request.cipherAlgorithm || 'aes256', request.privateKey)
  var res = {
    status: 200,
    headers: response.headers || new Headers({
      'content-type': 'application/egraphql'
    }),
    text: sinon.stub().returns(Promise.resolve(encrypt({
      payload: response.payload
    }, request.sessionPrivateKey)))
  }
  var fetchStub = sinon.stub(global, 'fetch').resolves(res)
  global.fetch = function (url, opts) {
    var req = decrypt(opts.body)
    t.equal(opts.method, 'POST')
    t.notEqual(req, null, 'req != null')
    if (request.handleSession) {
      global.fetch = fetchStub
      return request.handleSession(url, encrypt, decrypt)
    }
    t.deepEqual(req.payload.query, 'session { keyID, privateKey }')
    if (opts.headers) {
      t.equal(opts.headers.get('x-key-id'), request.keyID)
    }
    t.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{1,3}Z_[A-Za-z0-9]{16}#session$/g.test(req.id))
    var res = new Response(encrypt({
      payload: {
        session: request.session
      }
    }))
    res.headers.set('content-type', 'application/egraphql')
    global.fetch = fetchStub
    return Promise.resolve(res)
  }

  try {
    var graphqlFetch = graphqlFactory(request.url, request.keyID, request.privateKey, request.cipherAlgorithm, request.cipherPad)
  } catch (e) {
    fetchStub.restore()
    return Promise.reject(e)
  }

  var doRequest = function () {
    return graphqlFetch(request.query, request.variables, request.opts)
      .then(function (result) {
        t.same(result, response.payload, 'result be response payload')
        sinon.assert.calledWith(global.fetch, request.url, sinon.match(function (opts) {
          var json = decrypt(opts.body, request.sessionPrivateKey)
          opts.json = json
          t.deepEqual(Object.keys(json), ['id', 'payload'], 'Object.keys(json)')
          t.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{1,3}Z_[A-Za-z0-9]{16}$/g.test(json.id), 'id pattern')
          t.deepEqual(json.payload, {
            query: request.query,
            variables: request.variables || {}
          }, 'payload comparison')
          t.equal(opts.method, 'POST', 'opts.method')
          t.equal(opts.redirect, request.redirect || 'error', 'opts.redirect')
          t.ok(opts.headers instanceof Headers, 'opts.headers instanceof Headers')
          t.equal(opts.headers.get('x-cipher'), request.cipherAlgorithm || 'aes256', 'opts.headers.get("x-cipher")')
          t.equal(opts.headers.get('x-key-id'), request.session ? request.session.keyID : request.keyID, 'opts.headers.get("x-key-id")')
          t.equal(opts.headers.get('content-transfer-encoding'), 'base64', 'opts.headers.get("content-transfer-encoding")')
          t.equal(opts.headers.get('content-type'), 'application/egraphql', 'opts.headers.get("content-type")')
          if (request.checkOpts) {
            return request.checkOpts(opts)
          }
          return true
        }))
        return result
      })
      .then(function (result) {
        return {
          result: result,
          encrypt: encrypt
        }
      })
  }
  var req = (handleRequest ? handleRequest(doRequest) : doRequest())
  return req
    .catch(function (e) {
      fetchStub.restore()
      return Promise.reject(e)
    })
    .then(function () {
      fetchStub.restore()
    })
}

test('handle non-proper response code', function (t) {
  var graphqlFetch = graphqlFactory(graphqlUrl, 'admin', 'password')
  var errorText = 'some error'
  sinon.stub(global, 'fetch').resolves({
    status: 500,
    headers: new Headers(),
    text: sinon.stub().returns(Promise.resolve(errorText))
  })
  return graphqlFetch('{}')
    .then(function (data) {
      t.fail(('Request unexpectedly successful'))
      global.fetch.restore()
    })
    .catch(function (e) {
      t.equal(e.status, 500)
      t.equal(e.text, errorText)
      t.equal(e.code, 'EHTTPSTATUS')
      global.fetch.restore()
    })
})

test('handle non-proper response content-type', function (t) {
  var graphqlFetch = graphqlFactory(graphqlUrl, 'admin', 'password')
  sinon.stub(global, 'fetch').resolves({
    status: 200,
    headers: new Headers({
      'content-type': 'application/json'
    })
  })
  return graphqlFetch('{}')
    .then(function (data) {
      t.fail(('Request unexpectedly successful'))
      global.fetch.restore()
    })
    .catch(function (e) {
      t.equal(e.code, 'EHTTPCONTENTTYPE')
      t.equal(e.contentType, 'application/json')
      global.fetch.restore()
    })
})

test('make a graphql request', function (t) {
  return testRequest(t, {
    url: graphqlUrl,
    keyID: 'admin',
    privateKey: 'password',
    query: 'query { user { username } }'
  }, {
    payload: {
      data: 'something'
    }
  })
})

test('make a sessioned, graphql request', function (t) {
  var secret = crypto.randomBytes(256).toString('base64')
  var pass = 'password'
  return testRequest(t, {
    url: graphqlUrl,
    keyID: 'admin',
    cipherAlgorithm: 'aes-256-cbc',
    privateKey: pass,
    sessionPrivateKey: crypto.pbkdf2Sync(pass, secret, 100000, 256, 'sha512'),
    session: {
      keyID: 'other',
      secret: secret
    },
    query: 'query { user { username } }'
  }, {
    payload: {
      data: 'something'
    }
  })
})

test('handle errors in session management', function (t) {
  var pass = 'password'
  return testRequest(t, {
    url: graphqlUrl,
    keyID: 'admin',
    cipherAlgorithm: 'aes-256-cbc',
    privateKey: pass,
    handleSession: function () {
      return Promise.reject(new Error('just some error'))
    },
    query: 'query { user { username } }'
  }, {
    payload: {
      data: 'something'
    }
  }, function handleRequest (doRequest) {
    return Promise.all([
      doRequest(),
      doRequest()
    ]).then(function () {
      return doRequest()
    })
  })
})

test('handle null result in session management', function (t) {
  var pass = 'password'
  return testRequest(t, {
    url: graphqlUrl,
    keyID: 'admin',
    cipherAlgorithm: 'aes-256-cbc',
    privateKey: pass,
    handleSession: function (url, encrypt) {
      var res = new Response(encrypt({
        payload: {
          session: null
        }
      }))
      res.headers.set('content-type', 'application/egraphql')
      return Promise.resolve(res)
    },
    query: 'query { user { username } }'
  }, {
    payload: {
      data: 'something'
    }
  }, function handleRequest (doRequest) {
    return Promise.all([
      doRequest(),
      doRequest()
    ]).then(function () {
      return doRequest()
    })
  })
})

test('pass through redirect options', function (t) {
  return testRequest(t, {
    url: graphqlUrl,
    keyID: 'admin',
    privateKey: 'password',
    query: 'query { user { username } }',
    redirect: 'follow',
    opts: {
      redirect: 'follow'
    }
  }, {
    payload: {
      data: 'something'
    }
  })
})

test('handle non-proper response code', function (t) {
  var graphqlFetch = graphqlFactory(graphqlUrl, 'admin', 'password')
  var errorText = 'some error'
  var redirectLocation = 'abcd'
  sinon.stub(global, 'fetch').resolves({
    status: 301,
    headers: new Headers({
      location: redirectLocation
    }),
    text: function () {
      return Promise.resolve(errorText)
    }
  })
  return graphqlFetch('{}', {}, {
    redirect: 'follow'
  })
    .then(function (data) {
      t.fail(('Request unexpectedly successful'))
      global.fetch.restore()
    })
    .catch(function (e) {
      t.equal(e.status, 301)
      t.equal(e.text, errorText)
      t.equal(e.location, redirectLocation)
      t.equal(e.code, 'EHTTPREDIRECT')
      global.fetch.restore()
    })
})

test('make a graphql request w/ vars and fetch options', function (t) {
  var headers = new Headers()
  headers.append('authorization', 'abcd')
  headers.append('moreData', 'fancy')
  headers.append('content-type', 'text-html')
  return testRequest(t, {
    url: graphqlUrl,
    keyID: 'user',
    privateKey: 'fancy',
    cipherAlgorithm: 'des',
    cipherPad: 512,
    query: 'query { user { password } }',
    variables: { foo: 'bar' },
    opts: {
      headers: headers
    },
    checkOpts: function (opts) {
      t.equal(opts.headers.get('authorization'), 'abcd')
      t.equal(opts.headers.get('moreData'), 'fancy')
      return true
    }
  }, {
    payload: {
      other: 'fancystuff'
    }
  })
})

test('rejected without query', function (t) {
  return testRequest(t, { url: graphqlUrl, privateKey: 'foo' }, {})
    .then(function () {
      return Promise.reject(new Error('unt.equaled success'))
    })
    .catch(function (error) {
      t.equal(error.code, 'EQUERYMISSING')
    })
})

test('thrown an error if the graphqlUrl isnt given', function (t) {
  return testRequest(t, {
    url: null,
    privateKey: 'foo'
  }, {})
    .then(function () {
      throw new Error('unexpected success')
    })
    .catch(function (e) {
      if (e.code !== 'EURLMISSING') {
        throw new Error('unexpected error ' + e)
      }
    })
})

test('custom ids', function (t) {
  var id = graphqlFactory.id()
  return testRequest(t, {
    url: graphqlUrl,
    keyID: 'admin',
    privateKey: 'foo',
    opts: {
      id: id
    },
    query: 'query { user { username } }',
    checkOpts: function (opts) {
      t.equal(opts.json.id, id)
      return true
    }
  }, {
    payload: {
      data: 'true'
    }
  })
})
