# Service Desk Radio

A waiting-room record player page: add your own songs, press play, and the playlist loops until the meeting starts.

**Live page:** https://jordanyoerger.com/service-desk-radio/

## How the songs are kept

Songs you add are saved in the browser you added them in (IndexedDB), along with the playlist order, volume and repeat setting. Open the link again in that same browser and they are already loaded. Nothing is uploaded: a different browser or computer starts with an empty playlist.

## Updating the page

The site is the single file `docs/index.html`. It is generated from the page design by one script, which adds the song saving:

```
node tools/make-hosted.js "path/to/the page.html"
git add -A
git commit -m "Update the page"
git push
```

GitHub Pages serves the `docs` folder of the `main` branch.
