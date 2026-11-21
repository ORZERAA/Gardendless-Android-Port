import {test,expect} from 'bun:test';import {createRequire} from 'node:module';
const {install}=createRequire(import.meta.url)('../compat/android-export.js');
function fixture(mode='ok'){
 const statuses={},writes=[],names=[],listeners={};let count=0,nativeClicks=0;const objects=new Map();
 class Anchor{constructor(){this.download='';this.href='';}getAttribute(k){return this[k]}click(){nativeClicks++}}
 const win={HTMLAnchorElement:Anchor,URL:{createObjectURL:b=>{const key='blob:test'+(++count);objects.set(key,b);return key},revokeObjectURL:key=>objects.delete(key)},
 document:{getElementById:id=>statuses[id],createElement:()=>({style:{},setAttribute(){}}),body:{appendChild:e=>{statuses[e.id]=e}},addEventListener:(type,fn)=>{listeners[type]=fn}},
 fetch:async href=>{const blob=objects.get(href);if(!blob)throw Error('URL revoked');return{ok:true,arrayBuffer:()=>blob.arrayBuffer()}},
 __TAURI_INTERNALS__:{invoke:async()=>{throw Error('unexpected fallback')}},GardendlessBridge:{
 chooseExport:(id,name)=>{names.push(name);queueMicrotask(()=>win.__gdExportComplete(id,true,mode==='cancel'?null:'gd-export:test'))},
 writeExport:(id,target,data)=>{writes.push(data);queueMicrotask(()=>win.__gdExportComplete(id,mode!=='failure',mode==='failure'?'write failed':null))}
 }};
 install(win);return{win,Anchor,statuses,writes,names,listeners,get nativeClicks(){return nativeClicks}};
}
async function done(){for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));}
test('detached save anchor with immediate URL revocation exports exact content',async()=>{
 const f=fixture();const content='{"玩家":"测试","level":8}',blob=new Blob([content],{type:'application/json'});const url=f.win.URL.createObjectURL(blob);
 const a=new f.Anchor();a.download='存档.json';a.href=url;a.click();f.win.URL.revokeObjectURL(url);await done();
 expect(f.names).toEqual(['存档.json']);expect(Buffer.from(f.writes[0],'base64').toString()).toBe(content);expect(f.nativeClicks).toBe(0);expect(f.statuses['gd-export-status'].textContent).toContain('导出成功');
});
test('download cancel does not write and visible failure is reported',async()=>{
 for(const mode of ['cancel','failure']){const f=fixture(mode);const a=new f.Anchor();a.href=f.win.URL.createObjectURL(new Blob(['{}']));a.download='save.json';a.click();await done();
 expect(f.statuses['gd-export-status'].textContent).toContain(mode==='cancel'?'已取消':'导出失败');if(mode==='cancel')expect(f.writes.length).toBe(0);}
});
test('normal links continue native click; delegated downloads intercept once',async()=>{
 const f=fixture();const plain=new f.Anchor();plain.href='https://example.com';plain.click();expect(f.nativeClicks).toBe(1);
 const a=new f.Anchor();a.download='keys.json';a.href=f.win.URL.createObjectURL(new Blob(['{}']));let prevented=false;
 f.listeners.click({target:{closest:()=>a},preventDefault(){prevented=true},stopImmediatePropagation(){}});await done();expect(prevented).toBe(true);expect(f.writes.length).toBe(1);
});
