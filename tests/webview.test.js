import {test,expect} from 'bun:test';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const poly=fs.readFileSync(new URL('../compat/webview-platform.js',import.meta.url),'utf8');
const exporter=createRequire(import.meta.url)('../compat/android-export.js');
test('missing structuredClone: cycles, Map Set Date and typed arrays',()=>{
 const ctx=vm.createContext({structuredClone:undefined,AbortSignal:undefined,crypto:undefined,DOMException});vm.runInContext(poly,ctx);
 const result=vm.runInContext(`(()=>{const a={n:3,map:new Map([['x',2]]),set:new Set([4]),date:new Date(1000),data:new Uint8Array([0,255])};a.self=a;const b=structuredClone(a);return [b!==a,b.self===b,b.map.get('x'),b.set.has(4),b.date.getTime(),b.data[1]]})()`,ctx);
 expect(Array.from(result)).toEqual([true,true,2,true,1000,255]);
 expect(()=>vm.runInContext('structuredClone({f(){}})',ctx)).toThrow();
});
test('native clone remains untouched',()=>{
 const native=()=>42,ctx=vm.createContext({structuredClone:native,AbortSignal:undefined,crypto:undefined});vm.runInContext(poly,ctx);expect(ctx.structuredClone).toBe(native);
});
function fixture(mode='ok'){
 const log=[];let win;win={__TAURI_INTERNALS__:{invoke:async()=>{throw Error('legacy fallback called')}},GardendlessBridge:{
 chooseExport:(id,name)=>{log.push(name);queueMicrotask(()=>win.__gdExportComplete(id,true,mode==='cancel'?null:'gd-export:test'));},
 writeExport:(id,path,data)=>{log.push({path,data});queueMicrotask(()=>win.__gdExportComplete(id,mode!=='failure',mode==='failure'?'disk full':null));}
 }};exporter.install(win);return{win,log,call:win.__TAURI_INTERNALS__.invoke};
}
test('diagnostic save returns scoped token and writes UTF-8 bytes',async()=>{
 const {call,log}=fixture();const target=await call('plugin:dialog|save',{options:{defaultPath:'gp-next-startup-diagnostics.json'}});
 await call('plugin:fs|write_text_file',new TextEncoder().encode('{"问题":1}'),{headers:{path:encodeURIComponent(target)}});
 expect(log[0]).toBe('gp-next-startup-diagnostics.json');expect(new TextDecoder().decode(Uint8Array.from(atob(log[1].data),x=>x.charCodeAt(0)))).toBe('{"问题":1}');
});
test('export cancel resolves null, write failure rejects',async()=>{
 expect(await fixture('cancel').call('plugin:dialog|save',{options:{}})).toBe(null);
 const {call}=fixture('failure');await expect(call('plugin:fs|write_text_file',new Uint8Array([1]),{headers:{path:'gd-export:test'}})).rejects.toThrow('disk full');
});
