# graphql-fetch [![Build Status](https://travis-ci.org/martinheidegger/egraphql-fetch.svg?branch=master)](https://travis-ci.org/martinheidegger/egraphql-fetch) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)
Thin, **symmetrically encrypted**, GraphQL client powered by fetch.

_(Based on and compatible with [graphql-fetch](https://github.com/tjmehta/graphql-fetch))_

# Installation
```bash
npm i --save egraphql-fetch
```

# Usage
```js
var fetch = require('graphql-fetch')(
  'http://domain.com/graphql',
  'keyId', //         ... ID for the key (could be user-name)
  'secretKey', //     ... Secret Key to encrypt the data (could be password)
  // cipherAlgorithm, ... Cipher algorithm used to encrypt the request (default: aes256)
  // cipherPad        ... Padding to make traffic guessing harder (defaults: 1024)
)

var query = `
  query q (id: String!) {
    user(id: $id) {
      id,
      email,
      name
    }
  }
`
var queryVars = {
  id: 'abcdef'
}
var opts = {
  // custom fetch options
}

/**
 * @param  {Query} query graphql query
 * @param  {Object} [vars]  graphql query args, optional
 * @param  {Object} [opts]  fetch options, optional
 */
fetch(query, queryVars, opts).then(function (results) {
  if (results.errors) {
    //...
    return
  }
  var user = result.data.user
  //...
})
```

# Notes
* Uses [isomorphic-fetch](https://github.com/matthew-andrews/isomorphic-fetch) under the hood, which makes `fetch`, `Headers`, `Request`, and `Response` globally available.

# License
MIT
