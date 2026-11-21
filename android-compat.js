// Offline Android adapter for the extracted Gardendless 0.16.26 frontend.
// This source deliberately does not pretend to implement cloud services.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GardendlessCompat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PREFIX = 'gp-next/installed';
  const LIMIT = 64 * 1024 * 1024;
  const MAX_FILES = 8192;
  const encode = s => new TextEncoder().encode(s);
  const fail = (code, message) => Object.assign(new Error(message), { code });
  function path(raw) {
    if (typeof raw !== 'string' || !raw || raw.length > 1024 || /[\\:\x00-\x1f\x7f]/.test(raw))
      throw fail('INSTALL_INVALID_PATH', 'Invalid package path');
    const parts = raw.split('/');
    if (parts.length > 64) throw fail('INSTALL_INVALID_PATH', 'Package path is too deep');
    if (parts.some(p => !p || p === '.' || p === '..')) throw fail('INSTALL_INVALID_PATH', 'Invalid package path');
    return raw;
  }
  function digestId(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
      throw fail('INSTALL_INVALID_DIGEST', 'Invalid package digest');
    return value;
  }
  function decode64(value) {
    if (typeof value !== 'string' || value.length > Math.ceil(LIMIT / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
      throw fail('INSTALL_INVALID_BASE64', 'Invalid base64 file content');
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
  }
  function base64(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(result);
  }
  async function snapshot(input) {
    if (!Array.isArray(input) || input.length > MAX_FILES) throw fail('INSTALL_INVALID_SNAPSHOT', 'Too many files');
    const files = new Map(); let total = 0;
    for (const item of input) {
      if (!item || typeof item !== 'object') throw fail('INSTALL_INVALID_SNAPSHOT', 'Invalid file record');
      const name = path(item.path);
      if (files.has(name)) throw fail('INSTALL_INVALID_SNAPSHOT', 'Duplicate path: ' + name);
      // Reject oversized payloads before decoding or allocating the full snapshot.
      if (typeof item.base64 !== 'string' || item.base64.length > Math.ceil((LIMIT-total)/3)*4)
        throw fail('INSTALL_TOO_LARGE', 'Package exceeds 64 MiB limit');
      const bytes = decode64(item.base64); total += bytes.length + encode(name).length + 12;
      if (total > LIMIT) throw fail('INSTALL_TOO_LARGE', 'Package exceeds 64 MiB limit');
      files.set(name, bytes);
    }
    const names = [...files.keys()].sort();
    for (const name of names) {
      const parts = name.split('/');
      for (let i = 1; i < parts.length; i++) if (files.has(parts.slice(0, i).join('/')))
        throw fail('INSTALL_INVALID_SNAPSHOT', 'File/directory collision: ' + name);
    }
    const header = encode('gp-next-pack-snapshot-v1\0');
    const data = new Uint8Array(header.length + total), view = new DataView(data.buffer);
    data.set(header); let offset = header.length;
    for (const name of names) {
      const key = encode(name), bytes = files.get(name);
      view.setUint32(offset, key.length); offset += 4;
      view.setBigUint64(offset, BigInt(bytes.length)); offset += 8;
      data.set(key, offset); offset += key.length; data.set(bytes, offset); offset += bytes.length;
    }
    const sum = await crypto.subtle.digest('SHA-256', data);
    return {digest: [...new Uint8Array(sum)].map(x=>x.toString(16).padStart(2,'0')).join(''),
      files: names.map(name=>({path:name, base64:base64(files.get(name))}))};
  }
  function createStore(io) {
    let tail = Promise.resolve();
    function serial(fn) { const operation = tail.then(fn); tail = operation.catch(()=>{}); return operation; }
    async function directory(name) {
      const parts = name.split('/');
      for (let i=1;i<=parts.length;i++) {
        const current = parts.slice(0,i).join('/');
        if (!await io.exists(current)) await io.mkdir(current);
        const st = await io.stat(current);
        if (!st || !st.isDirectory || st.isSymlink) throw fail('INSTALL_INVALID_PATH','Unsafe directory: '+current);
      }
    }
    async function read(digest) {
      digestId(digest); const name = PREFIX+'/'+digest;
      if (!await io.exists(name)) return null;
      const entries = []; let total = 0;
      async function walk(dir, relative) {
        const stat = await io.stat(dir);
        if (!stat || !stat.isDirectory || stat.isSymlink) throw fail('INSTALL_CORRUPT','Unsafe installed directory');
        for (const item of await io.list(dir)) {
          const key = path(item.name);
          if (key.includes('/')) throw fail('INSTALL_CORRUPT','Invalid directory entry');
          const rel = relative ? relative+'/'+key : key, full=dir+'/'+key, st=await io.stat(full);
          if (!st || st.isSymlink) throw fail('INSTALL_CORRUPT','Symlink in installed package');
          if (st.isDirectory) { if(rel.split('/').length>64)throw fail('INSTALL_CORRUPT','Too deep'); await walk(full,rel); }
          else if (st.isFile) {
            total += st.size;
            if (!Number.isSafeInteger(st.size) || st.size<0 || total>LIMIT || entries.length>=MAX_FILES)
              throw fail('INSTALL_TOO_LARGE','Installed package exceeds limit');
            const data = await io.read(full);
            if (!(data instanceof Uint8Array) || data.length!==st.size)throw fail('INSTALL_CORRUPT','File changed while reading');
            entries.push({path:rel,base64:base64(data)});
          } else throw fail('INSTALL_CORRUPT','Non-regular installed file');
        }
      }
      await directory('gp-next'); await directory(PREFIX); await walk(name,'');
      const result = await snapshot(entries);
      if (result.digest!==digest) throw fail('INSTALL_CORRUPT','Installed package digest mismatch');
      return result.files;
    }
    return {
      read: digest=>serial(()=>read(digest)),
      install: (digest, files)=>serial(async()=>{
        digestId(digest); const packageData=await snapshot(files);
        if (packageData.digest!==digest)throw fail('INSTALL_INVALID_DIGEST','Package content does not match digest');
        if (await read(digest)!==null) return true;
        await directory(PREFIX);
        const stage=PREFIX+'/pending-'+crypto.randomUUID(), final=PREFIX+'/'+digest;
        await directory(stage);
        try {
          for(const item of packageData.files){
            const full=stage+'/'+item.path, index=full.lastIndexOf('/');
            await directory(full.slice(0,index)); await io.write(full,decode64(item.base64));
          }
          // Verify bytes before publish, not just the original input.
          const verify=[];for(const item of packageData.files)verify.push({path:item.path,base64:base64(await io.read(stage+'/'+item.path))});
          if((await snapshot(verify)).digest!==digest)throw fail('INSTALL_CORRUPT','Write verification failed');
          await io.rename(stage,final);
          if(await read(digest)===null)throw fail('INSTALL_CORRUPT','Published package missing');
          return false;
        } catch(error) {
          try {if(await io.exists(stage))await io.remove(stage);}catch(cleanup){throw new AggregateError([error,cleanup],'Package write and cleanup failed');}
          throw error;
        }
      })
    };
  }
  function install(win) {
    if (win.__gdCompatVersion) return;
    if (!win.GardendlessBridge || !win.__TAURI_INTERNALS__?.__gdHooked)
      throw fail('ANDROID_BRIDGE_MISSING','Legacy native bridge must be installed first');
    const invoke=win.__TAURI_INTERNALS__.invoke.bind(win.__TAURI_INTERNALS__), options={baseDir:14};
    const io={
      exists:p=>invoke('plugin:fs|exists',{path:p,options}),
      mkdir:async p=>{if(!win.GardendlessBridge.fsMkdir(p))throw Error('mkdir failed: '+p)},
      stat:p=>invoke('plugin:fs|lstat',{path:p,options}),
      list:p=>invoke('plugin:fs|read_dir',{path:p,options}),
      read:async p=>new Uint8Array(await invoke('plugin:fs|read_file',{path:p,options})),
      write:(p,data)=>invoke('plugin:fs|write_file',data,{headers:{path:encodeURIComponent(p),options:JSON.stringify(options)}}),
      rename:(a,b)=>invoke('plugin:fs|rename',{oldPath:a,newPath:b,options}),
      remove:p=>invoke('plugin:fs|remove',{path:p,options:{...options,recursive:true}})
    };
    const store=createStore(io);
    // Fingerprints are opaque change tokens, not upstream package snapshot digests.
    // Scan both package sources and overrides so edits are not silently skipped.
    async function sourceSnapshot(dir) {
      const records=[]; let size=0, count=0;
      async function visit(full, rel, depth) {
        if(depth>64)throw fail('INSTALL_INVALID_PATH','Source is too deep');
        const st=await io.stat(full);
        if(!st||st.isSymlink)throw fail('INSTALL_INVALID_PATH','Unsafe source path');
        if(st.isFile){
          size+=st.size;
          if(!Number.isSafeInteger(st.size)||st.size<0||size>LIMIT||++count>MAX_FILES)throw fail('INSTALL_TOO_LARGE','Source exceeds scan limit');
          const bytes=await io.read(full);
          if(bytes.length!==st.size)throw fail('INSTALL_CORRUPT','Source changed during scan');
          records.push({path:rel||'source.zip',base64:base64(bytes)});
        }else if(st.isDirectory){
          for(const child of await io.list(full)){
            const name=path(child.name);
            if(name.includes('/'))throw fail('INSTALL_INVALID_PATH','Invalid source entry');
            if(name.startsWith('.'))continue;
            await visit(full+'/'+name,rel?rel+'/'+name:name,depth+1);
          }
        }else throw fail('INSTALL_INVALID_PATH','Non-regular source');
      }
      const rootStat=await io.stat(dir);
      await visit(dir,'',0);
      return {data:await snapshot(records),isDirectory:!!rootStat.isDirectory};
    }
    async function capture(source){
      if(typeof source!=='string'||(!/^gp-next\/packs\/[^/]+$/.test(source)&&!['gp-next/patches','gp-next/__gpn_edits'].includes(source)))
        throw fail('INSTALL_INVALID_PATH','Invalid package source');
      path(source);
      if(!await io.exists(source))return null;
      const a=await sourceSnapshot(source),b=await sourceSnapshot(source);
      if(a.data.digest!==b.data.digest||a.isDirectory!==b.isDirectory)throw fail('INSTALL_SOURCE_CHANGED','Package changed during capture');
      if(a.isDirectory)return {zip:null,files:a.data.files};
      if(!/\.zip$/i.test(source))throw fail('INSTALL_INVALID_PATH','Expected a ZIP or directory source');
      return {zip:a.data.files[0].base64,files:[]};
    }
    async function inventory(){
      const sources=['gp-next/patches','gp-next/__gpn_edits'];
      if(await io.exists('gp-next/packs'))for(const child of await io.list('gp-next/packs')){
        const name=path(child.name);
        if(name.includes('/'))throw fail('INSTALL_INVALID_PATH','Invalid source entry');
        if(!name.startsWith('.')){
          const source='gp-next/packs/'+name;
          try {
            const st=await io.stat(source);
            if(st&&!st.isSymlink&&(st.isDirectory||(st.isFile&&/\.zip$/i.test(name))))sources.push(source);
          }catch(error){console.warn('[Android compat] Skipping invalid source:',source,error);}
        }
      }
      const result=[];
      for(const source of sources){
        try {
          if(await io.exists(source))result.push({path:source,fingerprint:(await sourceSnapshot(source)).data.digest});
        }catch(error){
          // Missing inventory entries let upstream examine individual sources; they must
          // not prevent valid packs or overrides from synchronizing in the same pass.
          console.warn('[Android compat] Source fingerprint unavailable:',source,error);
        }
      }
      return result;
    }
    win.__TAURI_INTERNALS__.invoke=async function(cmd,args={},opts){
      if(cmd==='gp_next_install_pack')return store.install(args.digest,args.files);
      if(cmd==='gp_next_read_installed_pack')return store.read(args.digest);
      if(cmd==='gp_next_local_package_inventory')return inventory();
      if(cmd==='gp_next_capture_local_pack')return capture(args.source);
      if(cmd.startsWith('gp_next_'))throw fail('ANDROID_UNSUPPORTED','Unsupported gp-next command: '+cmd);
      if(cmd==='cloud_journal_read')return null; // This separately packaged offline build never initiates cloud restore.
      if(cmd.startsWith('cloud_'))throw fail('ANDROID_OFFLINE_ONLY','Cloud operations are not supported in this build');
      if(cmd==='update_macos_menu'||cmd==='set_discord_activity')return null;
      if(cmd==='plugin:deep-link|get_current')return [];
      if(cmd==='plugin:path|join')return (args.paths||[]).map(String).join('/').replace(/\/+/g,'/');
      if(cmd==='plugin:path|basename')return String(args.path||'').replace(/\\/g,'/').split('/').pop();
      if(cmd==='plugin:window|set_fullscreen_on_monitor')throw fail('ANDROID_UNSUPPORTED','Desktop monitor selection is unsupported');
      return invoke(cmd,args,opts);
    };
    win.__gdCompatVersion='0.16.26-offline-alpha1';
  }
  return {snapshot,createStore,install,path};
});
