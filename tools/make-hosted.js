// Turns the single-file "Service Desk Radio" page into the hosted copy (docs/index.html).
//
// The page as designed plays songs straight from the files you pick and forgets them when the tab closes.
// The hosted copy adds one thing: every song you add is saved in the browser (IndexedDB), together with
// the playlist order, volume and repeat setting, so the playlist is still there the next time the link opens.
// Nothing is uploaded anywhere.
//
// usage:  node tools/make-hosted.js "<path to the page html>"
const fs = require('fs');
const path = require('path');

const input = process.argv[2];
if (!input) { console.error('usage: node tools/make-hosted.js "<path to the page html>"'); process.exit(1); }
let html = fs.readFileSync(input, 'utf8');

function swap(label, find, replacement) {
  const first = html.indexOf(find);
  if (first < 0) throw new Error('Could not find the "' + label + '" part of the page. The page may have changed; update tools/make-hosted.js.');
  if (html.indexOf(find, first + find.length) >= 0) throw new Error('The "' + label + '" part appears more than once.');
  html = html.slice(0, first) + replacement + html.slice(first + find.length);
}

// 1. Keep this waiting-room page out of search results.
swap('color-scheme meta', '<meta name="color-scheme" content="dark">', '<meta name="color-scheme" content="dark">\n<meta name="robots" content="noindex, nofollow">');

// 2. Say where the songs live.
swap('footer note', 'LOCAL FILES ONLY · NOTHING IS UPLOADED', 'SONGS ARE SAVED IN THIS BROWSER · NOTHING IS UPLOADED');

// 3. Adding songs: copy each one into memory and into the browser's storage.
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
` /* ---- Hosted copy: songs are remembered in this browser, so the playlist is still here next time. ---- */
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
   .catch(()=>{if(!storageWarned){storageWarned=true;tell('This browser will not keep the songs after the tab closes.');}});
 }
 function forgetSong(t){songStore('readwrite',s=>s.delete(t.key)).catch(()=>{});}
 async function restoreSongs(){
  const saved=readPrefs();
  if(typeof saved.volume==='number'&&saved.volume>=0&&saved.volume<=1){audio.volume=saved.volume;volume.value=String(saved.volume);}
  if(typeof saved.repeat==='boolean')repeat=saved.repeat;
  let rows=[];
  try{rows=await songStore('readonly',s=>s.getAll())||[];}catch{rows=[];}
  const order=Array.isArray(saved.order)?saved.order:[], place=k=>{const i=order.indexOf(k);return i<0?1e9:i;};
  rows.sort((a,b)=>place(a.key)-place(b.key)||(a.added||0)-(b.added||0));
  const kept=[];
  for(const r of rows){
   if(!r||!r.data||tracks.some(t=>t.key===r.key))continue;
   kept.push({key:r.key,title:r.title,url:URL.createObjectURL(new Blob([r.data],{type:r.type||'audio/mpeg'}))});
  }
  tracks=kept.concat(tracks);
  if(tracks.length&&!active)cue(tracks[0]);else{render();drawQueue();}
 }
 async function addFiles(files){
  const incoming=Array.from(files), wasEmpty=!tracks.length;
  const accepted=incoming.filter(f=>f.size>0&&(/^audio\\//i.test(f.type)||/\\.(mp3|wav|m4a|aac|ogg|flac|opus|aiff?)$/i.test(f.name)));
  let unread=0;
  for(const f of accepted){
   const key=f.name+'|'+f.size+'|'+f.lastModified;
   if(tracks.some(t=>t.key===key))continue;
   let data;
   try{data=await f.arrayBuffer();}catch{unread++;continue;}
   if(tracks.some(t=>t.key===key))continue;
   const type=f.type||'audio/mpeg', t={key,title:f.name.replace(/\\.[^.]+$/,'').trim()||f.name,url:URL.createObjectURL(new Blob([data],{type}))};
   tracks.push(t);keepSong(t,data,type);
  }
  savePrefs();
  if(wasEmpty&&tracks.length&&!active)cue(tracks[0]);else{render();drawQueue();}
  tell(unread?'A file could not be read. Check it still exists, then add it again.':!accepted.length?'Choose an MP3 or another audio file.':accepted.length<incoming.length?'Some files weren’t audio and were skipped.':'');
 }`);

// 4. Reordering and removing songs update what is saved.
swap('move', `  [tracks[i],tracks[target]]=[tracks[target],tracks[i]];render();drawQueue();`, `  [tracks[i],tracks[target]]=[tracks[target],tracks[i]];savePrefs();render();drawQueue();`);
swap('remove', `  const wasPlaying=!audio.paused;tracks.splice(i,1);`, `  const wasPlaying=!audio.paused;tracks.splice(i,1);forgetSong(t);savePrefs();`);

// 5. Volume and repeat are remembered too.
swap('repeat toggle', `$('loop').addEventListener('click',()=>{repeat=!repeat;render();});`, `$('loop').addEventListener('click',()=>{repeat=!repeat;savePrefs();render();});`);
swap('volume slider', `volume.addEventListener('input',()=>{audio.muted=false;audio.volume=Number(volume.value);});`, `volume.addEventListener('input',()=>{audio.muted=false;audio.volume=Number(volume.value);});\n volume.addEventListener('change',savePrefs);`);

// 6. Bring saved songs back when the page opens.
swap('startup', ` render();drawQueue();\n})();`, ` render();drawQueue();restoreSongs();\n})();`);

const out = path.join(__dirname, '..', 'docs', 'index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');
fs.writeFileSync(path.join(path.dirname(out), '.nojekyll'), '', 'utf8');
console.log('Wrote docs/index.html (' + (html.length / 1048576).toFixed(1) + ' MB)');
