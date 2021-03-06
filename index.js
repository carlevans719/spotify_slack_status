// @ts-check

try {
  const dev = require('./dev.json')
  for (let key in dev) {
    process.env[key] = dev[key]
  }
} catch (ex) {
  /* no-op */
}

(async function init () {
  // ------------ DATABASE --------------
  const databaseConfig = {
    connectionUri: process.env.MONGODB_URI
  }
  const { DatabaseService } = require('./services/database')
  const database = new DatabaseService(databaseConfig)

  await database.connect()

  // ----------- SLACK -------------
  const { SlackService } = require('./services/slack')
  const slackConfig = {
    token: process.env.SLACK_API_TOKEN
  }
  const slack = new SlackService(slackConfig, database)

  // --------- SPOTIFY ------------
  const spotifyConfig = {
    app: {
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      redirectUri: process.env.SPOTIFY_REDIRECT_URI
    },
    pollInterval: process.env.SPOTIFY_POLL_INTERVAL || 20 * 1000
  }
  
  const { SpotifyService } = require('./services/spotify')
  const spotify = new SpotifyService(spotifyConfig, database)
  
  await spotify.init()
  
  spotify.on(spotify.EVENTS.NOW_PLAYING_CHANGED, function onNewTrack (track) {
    slack.setStatus(track)
  })

  // ---------- WEBSERVER --------------
  const { WebserverService } = require('./services/webserver')
  const webserver = new WebserverService({port: process.env.PORT || 3000})

  webserver.on(webserver.EVENTS.HOME_ROUTE, async (req, res) => {
    switch (await spotify.getState()) {
      case spotify.STATES.MISSING_ACCESS_TOKEN:
        return res.redirect(await spotify.getAuthUri())
      case spotify.STATES.MISSING_APP_INFO:
        return await storeAppInfo(req, res, spotify)
      default: res.end(await spotify.getState())
    }
  })

  webserver.on(webserver.EVENTS.AUTH_ROUTE, async (req, res) => {
    console.log(await spotify.getState())
    switch (await spotify.getState()) {
      case spotify.STATES.MISSING_ACCESS_TOKEN:
        return await convertCodeToTokens(req, res, spotify)
      default: res.end(await spotify.getState())
    }
  })

  webserver.start()
})()

async function storeAppInfo (req, res, spotify) {
  if (req.query && Object.keys(req.query).length) {
    await spotify.setAppInfo({
      clientId: req.query.clientid,
      clientSecret: req.query.clientsecret,
      redirectUri: req.query.redirecturi
    })

    if (await spotify.getState() === spotify.STATES.MISSING_ACCESS_TOKEN) {
      return res.redirect(await spotify.getAuthUri())
    } else {
      res.end('Running!')
    }
  } else {
    const fs = require('fs')
    const path = require('path')
    const util = require('./lib/util')

    const reader = util.promisify(fs.readFile)
    const filePath = path.resolve('./templates/spotifyAppInfo.html')
    const html = await reader.call(fs, filePath)

    res.end(String(html))
  }
}

async function convertCodeToTokens (req, res, spotify) {
  if (req.query && Object.keys(req.query).length) {
    try {
      await spotify.codeToTokens(req.query.code, req.query.state)
      res.redirect('/')
    } catch (ex) {
      res.end(ex.message)
    }
  }
}
