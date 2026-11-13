// Turns the single-file "Service Desk Radio" page into the hosted copy (docs/index.html).
//
// The page as designed plays songs straight from the files you pick and forgets them when the tab closes.
// The hosted copy adds two things:
//   1. Built-in songs. Every song listed in tools/built-in-songs.json (the files live in docs/songs/) is
//      already in the playlist when the link opens, on any device.
//   2. Saved songs. Any other song you add is saved in the browser (IndexedDB), together with the playlist
//      order, volume and repeat setting, so it is still there the next time the link opens in that browser.
//
// usage:  node tools/make-hosted.js "<path to the page html>"
const fs = require('fs');
const path = require('path');

const input = process.argv[2];
if (!input) { console.error('usage: node tools/make-hosted.js "<path to the page html>"'); process.exit(1); }
let html = fs.readFileSync(input, 'utf8');

const docs = path.join(__dirname, '..', 'docs');
const listFile = path.join(__dirname, 'built-in-songs.json');
const builtIn = (fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')) : []).map(song => {
  const file = path.join(docs, 'songs', song.file);
  if (!fs.existsSync(file)) throw new Error('Built-in song is missing: docs/songs/' + song.file);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(song.file)) throw new Error('Use a plain lowercase file name (letters, digits, dashes) for ' + song.file);
  return { src: 'songs/' + song.file, title: song.title, size: fs.statSync(file).size };
});

function swap(label, find, replacement) {
  const first = html.indexOf(find);
  if (first < 0) throw new Error('Could not find the "' + label + '" part of the page. The page may have changed; update tools/make-hosted.js.');
  if (html.indexOf(find, first + find.length) >= 0) throw new Error('The "' + label + '" part appears more than once.');
  html = html.slice(0, first) + replacement + html.slice(first + find.length);
}

// 1. Keep this waiting-room page out of search results.
swap('color-scheme meta', '<meta name="color-scheme" content="dark">', '<meta name="color-scheme" content="dark">\n<meta name="robots" content="noindex, nofollow">');

// 2. Say where the songs live.
swap('footer note', 'LOCAL FILES ONLY · NOTHING IS UPLOADED', builtIn.length ? 'TOWN HALL MIX IS BUILT IN · SONGS YOU ADD STAY IN THIS BROWSER' : 'SONGS ARE SAVED IN THIS BROWSER · NOTHING IS UPLOADED');

// 3. Built-in songs, saved songs, and adding songs.
swap('addFiles', ` function addFiles(files){
  const incoming=Array.from(files), wasEmpty=!tracks.length;
  const accepted=incoming.filter(f=>f.size>0&&(/^audio\\//i.test(f.type)||/\\.(mp3|wav|m4a|aac|ogg|flac|opus|aiff?)$/i.test(f.name)));
  for(const f of accepted){
   if(tracks.some(t=>t.key===f.name+'|'+f.size+'|'+f.lastModified))continue;
   tracks.push({key:f.name+'|'+f.size+'|'+f.lastModified,title:f.name.replace(/\\.[^.]+$/,'').trim()||f.name,url:URL.createObjectURL(f)});
  }
  if(wasEmpty&&tracks.length)cue(tracks[0]);else{render();drawQueue();}
  tell(!accepted.length?'Choose an MP3 or another audio file.':accepted.length<incoming.length?'Some files weren’t audio and were skipped.':'');
 }`,
` /* ---- Hosted copy: built-in songs come with the page; songs you add are remembered in this browser. ---- */
 const BUILT_IN=/*@BUILT_IN@*/[];
 const SONGS='songs', PREFS='service-desk-radio:prefs';
 let dbOpen=null, storageWarned=false;
 function db(){
  return dbOpen||(dbOpen=new Promise((resolve,reject)=>{
   try{
    const r=indexedDB.open('service-desk-radio',1);
    r.onupgradeneeded=()=>r.result.createObjectStore(SONGS,{keyPath:'key'});
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('blocked'));
   }catch(e){reject(e);}
  }));
 }
 function songStore(mode,work){
  return db().then(d=>new Promise((resolve,reject)=>{
   const t=d.transaction(SONGS,mode),req=work(t.objectStore(SONGS));
   t.oncomplete=()=>resolve(req?req.result:undefined);t.onerror=t.onabort=()=>reject(t.error);
  }));
 }
 function readPrefs(){try{return JSON.parse(localStorage.getItem(PREFS))||{};}catch{return {};}}
 function savePrefs(){try{localStorage.setItem(PREFS,JSON.stringify({order:tracks.map(t=>t.key),volume:audio.volume,repeat}));}catch{}}
 function keepSong(t,data,type){
  // The song's bytes are stored, not a pointer to the file, so it still plays if the file is later moved or renamed.
  songStore('readwrite',s=>s.put({key:t.key,title:t.title,type,data,added:Date.now()}))
   .then(()=>{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});})
   .catch(()=>{if(!storageWarned){storageWarned=true;tell('This browser will not keep the songs you add after the tab closes.');}});
 }
 function forgetSong(t){songStore('readwrite',s=>s.delete(t.key)).catch(()=>{});}
 function builtInTrack(b){
  // Starts out streaming from the site. Once the whole file has arrived it plays from memory instead,
  // so a network hiccup in the middle of the meeting cannot stall a song change.
  const t={key:'built-in:'+b.src,title:b.title,src:b.src,held:'',builtIn:true};
  Object.defineProperty(t,'url',{get(){return this.held||this.src;}});
  return t;
 }
 function holdBuiltIns(list){
  for(const t of list)fetch(t.src).then(r=>r.ok?r.blob():null).then(blob=>{if(blob&&tracks.includes(t))t.held=URL.createObjectURL(blob);}).catch(()=>{});
 }
 async function restoreSongs(){
  const saved=readPrefs();
  if(typeof saved.volume==='number'&&saved.volume>=0&&saved.volume<=1){audio.volume=saved.volume;volume.value=String(saved.volume);}
  if(typeof saved.repeat==='boolean')repeat=saved.repeat;
  let rows=[];
  try{rows=await songStore('readonly',s=>s.getAll())||[];}catch{rows=[];}
  rows.sort((a,b)=>(a.added||0)-(b.added||0));
  const builtIns=BUILT_IN.map(builtInTrack), kept=[];
  for(const r of rows){
   if(!r||!r.data)continue;
   if(BUILT_IN.some(b=>b.size===r.data.byteLength)){forgetSong(r);continue;}   // the same song is built in now: drop the saved copy
   if(tracks.some(t=>t.key===r.key))continue;
   kept.push({key:r.key,title:r.title,url:URL.createObjectURL(new Blob([r.data],{type:r.type||'audio/mpeg'}))});
  }
  const order=Array.isArray(saved.order)?saved.order:[];
  const all=builtIns.concat(kept).map((t,i)=>{const at=order.indexOf(t.key);return {t,at:at>=0?at:t.builtIn?i-1000:1e6+i};}).sort((a,b)=>a.at-b.at).map(x=>x.t);
  tracks=all.concat(tracks);
  if(tracks.length&&!active)cue(tracks[0]);else{render();drawQueue();}
  holdBuiltIns(builtIns);
 }
 async function addFiles(files){
  const incoming=Array.from(files), wasEmpty=!tracks.length;
  const accepted=incoming.filter(f=>f.size>0&&(/^audio\\//i.test(f.type)||/\\.(mp3|wav|m4a|aac|ogg|flac|opus|aiff?)$/i.test(f.name)));
  let unread=0, already=0;
  for(const f of accepted){
   const key=f.name+'|'+f.size+'|'+f.lastModified;
   if(tracks.some(t=>t.key===key)){already++;continue;}
   if(BUILT_IN.some(b=>b.size===f.size)){already++;continue;}
   let data;
   try{data=await f.arrayBuffer();}catch{unread++;continue;}
   if(tracks.some(t=>t.key===key))continue;
   const type=f.type||'audio/mpeg', t={key,title:f.name.replace(/\\.[^.]+$/,'').trim()||f.name,url:URL.createObjectURL(new Blob([data],{type}))};
   tracks.push(t);keepSong(t,data,type);
  }
  savePrefs();
  if(wasEmpty&&tracks.length&&!active)cue(tracks[0]);else{render();drawQueue();}
  tell(unread?'A file could not be read. Check it still exists, then add it again.':!accepted.length?'Choose an MP3 or another audio file.':accepted.length<incoming.length?'Some files weren’t audio and were skipped.':already&&already===accepted.length?'Already in the playlist.':'');
 }`.replace('/*@BUILT_IN@*/[]', JSON.stringify(builtIn)));

// 4. Reordering and removing songs update what is saved.
swap('move', `  [tracks[i],tracks[target]]=[tracks[target],tracks[i]];render();drawQueue();`, `  [tracks[i],tracks[target]]=[tracks[target],tracks[i]];savePrefs();render();drawQueue();`);
swap('remove', `  const wasPlaying=!audio.paused;tracks.splice(i,1);`, `  const wasPlaying=!audio.paused;tracks.splice(i,1);if(!t.builtIn)forgetSong(t);savePrefs();`);

// 5. Volume and repeat are remembered too.
swap('repeat toggle', `$('loop').addEventListener('click',()=>{repeat=!repeat;render();});`, `$('loop').addEventListener('click',()=>{repeat=!repeat;savePrefs();render();});`);
swap('volume slider', `volume.addEventListener('input',()=>{audio.muted=false;audio.volume=Number(volume.value);});`, `volume.addEventListener('input',()=>{audio.muted=false;audio.volume=Number(volume.value);});\n volume.addEventListener('change',savePrefs);`);

// 6. Bring the playlist back when the page opens.
swap('startup', ` render();drawQueue();\n})();`, ` render();drawQueue();restoreSongs();\n})();`);

fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(path.join(docs, 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(docs, '.nojekyll'), '', 'utf8');
console.log('Wrote docs/index.html (' + (html.length / 1048576).toFixed(1) + ' MB) with ' + builtIn.length + ' built-in song' + (builtIn.length === 1 ? '' : 's') + (builtIn.length ? ': ' + builtIn.map(b => b.title + ' [' + (b.size / 1048576).toFixed(1) + ' MB]').join(', ') : ''));
