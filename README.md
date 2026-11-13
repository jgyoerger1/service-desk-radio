# Service Desk Radio

A waiting-room record player page: press play and the playlist loops until the meeting starts.

**Live page:** https://jordanyoerger.com/service-desk-radio/

## Where the songs come from

- **Built-in songs.** The songs in `docs/songs/` are part of the site, so they are already in the playlist when the link opens, on any device and in any browser. They are listed, in playing order, in `tools/built-in-songs.json`.
- **Songs you add.** Any other song you add on the page is saved in the browser you added it in (IndexedDB), along with the playlist order, volume and repeat setting. Those stay in that one browser and are not uploaded.

Removing a built-in song from the playlist only lasts for that visit: it is back the next time the link opens.

## Changing the built-in songs

1. Put the MP3 in `docs/songs/` with a plain lowercase name (letters, digits, dashes).
2. Add or remove its line in `tools/built-in-songs.json`. The order there is the playing order.
3. Rebuild and publish:

```
node tools/make-hosted.js "path/to/the page.html"
git add -A
git commit -m "Update the songs"
git push
```

## Updating the page design

The site is the single file `docs/index.html`. It is generated from the page design by `tools/make-hosted.js`, which adds the built-in playlist and the song saving. Run the same three commands above with the new design file.

GitHub Pages serves the `docs` folder of the `main` branch.
