import {test,expect} from 'bun:test';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../compat/legacy-shim.js',import.meta.url),'utf8');
test('legacy bridge handles absolute paths and URL-encodes file names',async()=>{
 const requests=[],origin='https://appassets.androidplatform.net/';
 const win={GardendlessBridge:{appDataRoot:()=>'/data/app/files'},__TAURI_INTERNALS__:{invoke:async()=>null}};
 const context=vm.createContext({window:win,Element:class{},Document:class{},
 HTMLAnchorElement:class{click(){}},document:{addEventListener(){}},
 TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,console,Promise,
 setTimeout:()=>0,fetch:async url=>{requests.push(url);return{ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}}});
 vm.runInContext(source,context);
 await win.__TAURI_INTERNALS__.invoke('plugin:fs|read_file',{path:'/data/app/files/gp-next/pack #1/a?.json'});
 expect(requests[0]).toBe(origin+'gp-next/pack%20%231/a%3F.json');
});
test('legacy bridge propagates mkdir / remove failure',async()=>{
 const win={GardendlessBridge:{appDataRoot:()=>'',fsMkdir:()=>false,fsRemove:()=>false},__TAURI_INTERNALS__:{invoke:async()=>null}};
 const context=vm.createContext({window:win,Element:class{},Document:class{},HTMLAnchorElement:class{click(){}},document:{addEventListener(){}},TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,console,Promise,setTimeout:()=>0});
 vm.runInContext(source,context);
 await expect(win.__TAURI_INTERNALS__.invoke('plugin:fs|mkdir',{path:'gp-next/a'})).rejects.toThrow('mkdir failed');
 await expect(win.__TAURI_INTERNALS__.invoke('plugin:fs|remove',{path:'gp-next/a'})).rejects.toThrow('remove failed');
});
