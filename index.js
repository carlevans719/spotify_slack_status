// @ts-check

(async function init () {
  // ------------ DATABASE --------------
  const databaseConfig = {
    connectionUri: process.env.MONGO_URI
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
    }
  }

  const { SpotifyService } = require('./services/spotify')
  const spotify = new SpotifyService(spotifyConfig, database)
  
  await spotify.init()

  setInterval(async function pollSpotify () {
    const track = await spotify.getNowPlaying()
    slack.setStatus(track)
  }, 1000 * 10)
})()
