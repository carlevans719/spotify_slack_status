// @ts-check

const util = require('../lib/util')

class DatabaseService {
  constructor (config) {
    const { MongoClient } = require('mongodb')
    this.client = MongoClient
    this._config = config
  }

  async connect () {
    const makeConnection = util.promisify(this.client.connect)
    const db = await makeConnection.call(this.client, this._config.connectionUri)
    this.db = db

    return true
  }

  getCollection (name = 'config') {
    if (!this.db) {
      throw new Error('db_not_initialised')
    }

    return this.db.collection(name)
  }

  async get (selector) {
    const cursor = this.getCollection().find({key: selector})
    return await cursor.toArray()
  }

  async getOne (selector) {
    return (await this.get(selector))[0]
  }

  async set (key, doc) {
    const collection = this.getCollection()

    if (!(await this.getOne(key))) {
      return await collection.insertMany([Object.assign({key}, doc)])
    } else {
      return await collection.updateOne({key}, {$set: doc})
    }
  }

  async remove (key) {
    const collection = this.getCollection()
    return await collection.deleteOne({key})
  }
}

module.exports.DatabaseService = DatabaseService
