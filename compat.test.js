import {test,expect} from 'bun:test';
import {createRequire} from 'node:module';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const {snapshot,createStore}=createRequire(import.meta.url)('../compat/android-compat.js');
const entry=(path,text)=>({path,base64:Buffer.from(text).toString('base64')});
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'gardendless-compat-'));
 const disk=p=>path.join(root,...p.split('/'));
 const io={
  exists:async p=>!!(await fs.lstat(disk(p)).catch(()=>null)),
  mkdir:async p=>fs.mkdir(disk(p),{recursive:true}),
  stat:async p=>{const s=await fs.lstat(disk(p));return{isDirectory:s.isDirectory(),isFile:s.isFile(),isSymlink:s.isSymbolicLink(),size:s.size}},
  list:async p=>(await fs.readdir(disk(p))).map(name=>({name})),
  read:async p=>new Uint8Array(await fs.readFile(disk(p))),
  write:async(p,b)=>fs.writeFile(disk(p),b),
  rename:async(a,b)=>fs.rename(disk(a),disk(b)),
  remove:async p=>fs.rm(disk(p),{force:true,recursive:true})
 };
 try{await fn(io,root)}finally{await fs.rm(root,{force:true,recursive:true})}
}
test('empty digest matches extracted upstream format',async()=>{
 expect((await snapshot([])).digest).toBe('6b4a732c1fb6f9a72454c36888622037f9e9964a67d44fcac7417083a966b9db');
});
test('deterministic ordering and Unicode / binary content',async()=>{
 const a=entry('pack.json','{"name":"测试"}'),b={path:'data/bytes.bin',base64:'AP8BAg=='};
 const x=await snapshot([b,a]),y=await snapshot([a,b]);expect(x.digest).toBe(y.digest);expect(x.files).toEqual(y.files);
});
test('reject unsafe paths, collisions and invalid base64',async()=>{
 for(const p of ['../a','/a','a/../b','a//b','a/./b','a\\b','C:/a','a\0b'])
  await expect(snapshot([entry(p,'x')])).rejects.toBeInstanceOf(Error);
 await expect(snapshot([entry('a','x'),entry('a','y')])).rejects.toBeInstanceOf(Error);
 await expect(snapshot([entry('a','x'),entry('a/b','y')])).rejects.toBeInstanceOf(Error);
 await expect(snapshot([{path:'a',base64:'not base64!'}])).rejects.toBeInstanceOf(Error);
});
test('install, reuse and new instance read persistent disk',async()=>fixture(async io=>{
 const p=await snapshot([entry('pack.json','{}'),entry('nested/a.json','{"v":1}')]);
 const s=createStore(io);expect(await s.install(p.digest,p.files)).toBe(false);
 expect(await s.install(p.digest,p.files)).toBe(true);expect(await s.read(p.digest)).toEqual(p.files);
 expect(await createStore(io).read(p.digest)).toEqual(p.files);
 expect((await io.list('gp-next/installed')).some(x=>x.name.startsWith('pending-'))).toBe(false);
}));
test('empty package persists as a real directory',async()=>fixture(async io=>{
 const p=await snapshot([]);await createStore(io).install(p.digest,[]);expect(await createStore(io).read(p.digest)).toEqual([]);
}));
test('reject digest mismatch before disk mutation',async()=>fixture(async io=>{
 const p=await snapshot([entry('pack.json','{}')]);
 await expect(createStore(io).install('a'.repeat(64),p.files)).rejects.toBeInstanceOf(Error);
 expect(await io.exists('gp-next')).toBe(false);
}));
test('detect corrupt stored files',async()=>fixture(async io=>{
 const p=await snapshot([entry('pack.json','{}')]);await createStore(io).install(p.digest,p.files);
 await io.write('gp-next/installed/'+p.digest+'/pack.json',new TextEncoder().encode('corrupt'));
 await expect(createStore(io).read(p.digest)).rejects.toBeInstanceOf(Error);
 await expect(createStore(io).install(p.digest,p.files)).rejects.toBeInstanceOf(Error);
}));
test('failed write cleans staging and never publishes digest',async()=>fixture(async io=>{
 const p=await snapshot([entry('pack.json','{}')]);const broken={...io,write:async()=>{throw Error('disk full')}};
 await expect(createStore(broken).install(p.digest,p.files)).rejects.toThrow('disk full');
 expect(await io.exists('gp-next/installed/'+p.digest)).toBe(false);expect(await io.list('gp-next/installed')).toEqual([]);
}));
test('concurrent duplicate installations are serialized',async()=>fixture(async io=>{
 const p=await snapshot([entry('pack.json','{}')]),s=createStore(io);
 expect(await Promise.all([s.install(p.digest,p.files),s.install(p.digest,p.files)])).toEqual([false,true]);
}));
test('missing digest returns null and invalid digest rejects',async()=>fixture(async io=>{
 expect(await createStore(io).read('a'.repeat(64))).toBe(null);
 await expect(createStore(io).read('../a')).rejects.toBeInstanceOf(Error);
}));
test('symlink directory rejected',async()=>fixture(async io=>{
 const p=await snapshot([]);const unsafe={...io,exists:async()=>true,stat:async()=>({isDirectory:true,isSymlink:true})};
 await expect(createStore(unsafe).install(p.digest,[])).rejects.toBeInstanceOf(Error);
}));
