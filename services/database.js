// @ts-check

const util = require('../lib/util')

class DatabaseService {
  constructor (config) {
    const { MongoClient } = require('mongodb')
    this.client = MongoClient
    this.config = config
  }

  async connect () {
    const makeConnection = util.promisify(this.client.connect)
    const db = await makeConnection.call(this.client, this.config.connectionUri)
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

    const fetcher = util.promisify(cursor.toArray)
    const docs = await fetcher.call(cursor)

    return docs
  }

  async getOne (selector) {
    return await this.get(selector)[0]
  }

  async set (key, doc) {
    const collection = this.getCollection()

    const inserter = util.promisify(this.db.insertMany)
    const updater = util.promisify(this.db.updateOne)

    if (!(await this.getOne(key))) {
      return await inserter.call(this.db, [Object.assign({key}, doc)])
    } else {
      return await updater.call(this.db, {key}, {$set: doc})
    }
  }
}

module.exports.DatabaseService = DatabaseService
