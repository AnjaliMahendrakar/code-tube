# CodeTube

A YouTube-style website of hand-picked videos for learning to code and cracking interviews, in English, Hindi and Telugu.

- 198 videos and full-course playlists from 96 channels, chosen for clear explanations rather than view counts
- Topics: Python, C++, Java, JavaScript, Go, Rust, C, SQL, web, backend, DevOps, build-from-scratch projects, DSA, system design, CS fundamentals, interview practice, ML, GenAI, agentic AI, research papers, university lectures and tech talks
- Videos play on the site with YouTube's official embedded player
- Search with suggestions, topic and language chips, channel pages, 8 ordered learning paths
- Watch history with resume, stored only in each visitor's browser. No accounts and no login.

Every link was checked against YouTube on 8 November 2026, including whether the owner allows playback on other websites.

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer. There are no packages to install.

```bash
cd code-tube
node server.js
```

Open http://localhost:3000.

To use a different port: `PORT=8080 node server.js` (on Windows PowerShell: `$env:PORT=8080; node server.js`).

## Put it online so anyone can open the link

### Vercel (recommended)

The repo is ready for Vercel: `vercel.json` serves `public/` as static files, sends every `/api/*` request to the serverless function in `api/index.js`, and routes app pages like `/watch` and `/@channel` to `index.html`.

1. Go to [vercel.com/new](https://vercel.com/new) and sign in with GitHub.
2. Import the `code-tube` repository.
3. Leave the settings as they are (Framework Preset: Other) and click **Deploy**.

Vercel gives you a link like `https://code-tube.vercel.app`. Every push to `main` redeploys the site automatically.

### Any Node host (Render, Railway, a VPS)

Run `node server.js` as the start command. The host provides the `PORT` variable. On free plans the site may take a few seconds to wake up after a quiet period.

## How it works

```
code-tube/
├── server.js           Node HTTP server: JSON API + static files (no dependencies)
├── api/index.js        Vercel serverless entry point (reuses server.js)
├── vercel.json         Vercel routing and security headers
├── data/catalog.json   The catalog: topics, learning paths and all videos
├── public/
│   ├── index.html      App shell (header, search, navigation)
│   ├── styles.css      YouTube-like light and dark styles
│   ├── app.js          Single-page app: home, watch, search, history, paths, channels
│   └── favicon.svg
└── test/api.test.js    API tests (Node's built-in test runner)
```

The server loads `catalog.json` into memory, answers API requests and serves the page. The browser app uses clean URLs like YouTube's (`/watch?v=…`, `/results?search_query=…`, `/feed/history`, `/@channel`), so you can share a link to any video.

### Playback

Videos use the YouTube IFrame player from `youtube-nocookie.com`. If that script can't load, the page falls back to a plain embed, so the video still plays. If a channel later turns off playback on other sites, the player shows a **Watch on YouTube** button.

### Watch history

History lives in the visitor's browser (`localStorage`), so it stays on their device and is never sent to the server. The page saves how far you watched every few seconds, shows the red progress bar on thumbnails, and resumes where you stopped. On the History page you can search, remove single videos, clear everything or pause history. Clearing browser data also clears it.

### API

| Route | What it returns |
| --- | --- |
| `GET /api/videos?topic=&lang=&type=&offset=&limit=` | A page of the catalog (`lang` is `en`, `hi` or `te`; `type` is `video` or `playlist`) |
| `GET /api/videos/:id` | One item (`v-<videoId>` or `p-<playlistId>`) with related items and learning paths |
| `GET /api/watch?v=` or `?list=` | The same, looked up by YouTube video or playlist id |
| `GET /api/search?q=&lang=` | Ranked search over titles, channels, topics and descriptions |
| `GET /api/suggest?q=` | Up to 8 title suggestions for the search box |
| `GET /api/topics?lang=` | Topics with counts |
| `GET /api/channels/:handle` | A channel and its items |
| `GET /api/paths` | Learning paths with their items in order |
| `GET /api/health` | `{ ok: true, items }` |

## Add or change videos

Edit `data/catalog.json`. Each item looks like this:

```json
{
  "id": "v-rfscVS0vtbw",
  "type": "video",
  "ytId": "rfscVS0vtbw",
  "title": "Learn Python – Full Course for Beginners",
  "channel": "freeCodeCamp.org",
  "handle": "freecodecamp",
  "avatar": "https://yt3.googleusercontent.com/...=s88-c-k-c0x00ffffff-no-rj",
  "length": "4:26:52",
  "lang": "en",
  "topics": ["python"],
  "about": "One line on why it is worth watching.",
  "thumb": "rfscVS0vtbw"
}
```

- For a playlist, use `"type": "playlist"`, an id starting with `p-`, the playlist id (`PL…`) as `ytId`, and the first video's id as `thumb`.
- `topics` must use ids from the `topics` list at the top of the file. The first topic is the main one.
- Before adding a video, open `https://www.youtube.com/oembed?url=<video link>`. If it shows an error, the owner has turned off playback on other sites and the video will only open on YouTube.

Restart the server after editing. Run the tests to check the file:

```bash
npm test
```

## Credits

All videos belong to their creators and play through YouTube's official player. CodeTube only links and embeds them.
