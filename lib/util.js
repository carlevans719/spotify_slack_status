const uuid = require('uuid')

/**
 * Convert a function which normally expects a callback into a promise-based one
 *
 * @export
 * @param {Function} func 
 * @returns {Function} a new function which, when called, will return a promise
 */
function promisify (func) {
  return function promisified (...args) {
    return new Promise((resolve, reject) => {
      function callback (err, res) {
        if (err) {
          return reject(err)
        } else {
          return resolve(res)
        }
      }

      args.push(callback)
      func.apply(this, args)
    })
  }
}

module.exports.promisify = promisify
module.exports.uuid = uuid
