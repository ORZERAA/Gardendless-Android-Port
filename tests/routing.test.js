import {test,expect} from 'bun:test';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {install,snapshot}=createRequire(import.meta.url)('../compat/android-compat.js');
async function app(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gd-routing-'));
 const disk=p=>path.join(root,...p.split('/'));
 const opts={};
 const inv=async(cmd,args={},extra)=>{
  const p=args.path;
  switch(cmd){
   case 'plugin:fs|exists':return fs.existsSync(disk(p));
   case 'plugin:fs|lstat':{const st=fs.lstatSync(disk(p));return {isFile:st.isFile(),isDirectory:st.isDirectory(),isSymlink:st.isSymbolicLink(),size:st.size}}
   case 'plugin:fs|read_dir':return fs.readdirSync(disk(p)).map(name=>({name}));
   case 'plugin:fs|read_file':return new Uint8Array(fs.readFileSync(disk(p))).buffer;
   case 'plugin:fs|write_file':fs.writeFileSync(disk(decodeURIComponent(extra.headers.path)),args);return null;
   case 'plugin:fs|rename':fs.renameSync(disk(args.oldPath),disk(args.newPath));return null;
   case 'plugin:fs|remove':fs.rmSync(disk(p),{recursive:true});return null;
   default:throw Error('Unhandled: '+cmd);
  }
 };
 const win={GardendlessBridge:{fsMkdir:p=>{fs.mkdirSync(disk(p),{recursive:true});return true}},__TAURI_INTERNALS__:{__gdHooked:true,invoke:inv}};
 install(win);try{await fn(win,root)}finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('custom commands write disk and can be read by a fresh runtime',async()=>app(async(win,root)=>{
 const p=await snapshot([{path:'pack.json',base64:btoa('{}')}]),invoke=win.__TAURI_INTERNALS__.invoke;
 expect(await invoke('gp_next_install_pack',{digest:p.digest,files:p.files})).toBe(false);
 expect(await invoke('gp_next_read_installed_pack',{digest:p.digest})).toEqual(p.files);
 expect(fs.existsSync(path.join(root,'gp-next','installed',p.digest,'pack.json'))).toBe(true);
}));
test('inventory fingerprints change for package and override edits',async()=>app(async(win,root)=>{
 const dir=path.join(root,'gp-next','packs','demo');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'pack.json'),'{}');
 const patch=path.join(root,'gp-next','patches');fs.mkdirSync(patch,{recursive:true});fs.writeFileSync(path.join(patch,'data.json'),'1');
 const call=()=>win.__TAURI_INTERNALS__.invoke('gp_next_local_package_inventory');
 const before=await call();expect(before.map(x=>x.path).sort()).toEqual(['gp-next/packs/demo','gp-next/patches']);
 fs.writeFileSync(path.join(patch,'data.json'),'2');const after=await call();
 expect(after.find(x=>x.path.endsWith('/patches')).fingerprint).not.toBe(before.find(x=>x.path.endsWith('/patches')).fingerprint);
 expect(after.find(x=>x.path.endsWith('/demo')).fingerprint).toBe(before.find(x=>x.path.endsWith('/demo')).fingerprint);
}));
test('unsupported cloud and gp-next commands reject instead of fake success',async()=>app(async win=>{
 const call=win.__TAURI_INTERNALS__.invoke;
 await expect(call('gp_next_unknown')).rejects.toThrow('Unsupported');
 await expect(call('cloud_restore')).rejects.toThrow('Cloud');
 expect(await call('cloud_journal_read')).toBe(null);
}));
test('install guard prevents rewrapping and rejects absent native bridge',async()=>app(async win=>{
 const first=win.__TAURI_INTERNALS__.invoke;install(win);expect(win.__TAURI_INTERNALS__.invoke).toBe(first);
 expect(()=>install({})).toThrow('bridge');
}));
test('capture directory preserves byte content and ZIP capture returns raw archive',async()=>app(async(win,root)=>{
 const dir=path.join(root,'gp-next','packs','demo');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'pack.json'),'{}');
 const call=win.__TAURI_INTERNALS__.invoke;
 expect(await call('gp_next_capture_local_pack',{source:'gp-next/packs/demo'})).toEqual({zip:null,files:[{path:'pack.json',base64:'e30='}]});
 fs.writeFileSync(path.join(root,'gp-next','packs','archive.zip'),Buffer.from([80,75,3,4]));
 expect(await call('gp_next_capture_local_pack',{source:'gp-next/packs/archive.zip'})).toEqual({zip:'UEsDBA==',files:[]});
 expect(await call('gp_next_capture_local_pack',{source:'gp-next/packs/missing'})).toBe(null);
 await expect(call('gp_next_capture_local_pack',{source:'gp-next/installed/x'})).rejects.toThrow('Invalid');
}));
test('irrelevant or oversized pack source cannot block valid sources',async()=>app(async(win,root)=>{
 const packs=path.join(root,'gp-next','packs');fs.mkdirSync(path.join(packs,'good'),{recursive:true});
 fs.writeFileSync(path.join(packs,'good','pack.json'),'{}');
 fs.writeFileSync(path.join(packs,'ignore.txt'),'irrelevant');
 fs.writeFileSync(path.join(packs,'oversized.zip'),'');fs.truncateSync(path.join(packs,'oversized.zip'),65*1024*1024);
 const list=await win.__TAURI_INTERNALS__.invoke('gp_next_local_package_inventory');
 expect(list.map(x=>x.path)).toEqual(['gp-next/packs/good']);
}));
