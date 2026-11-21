(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else api.install(root);})(globalThis,function(){
 'use strict';
 function install(win){
  const bridge=win.GardendlessBridge,ti=win.__TAURI_INTERNALS__;
  if(!bridge||!ti||ti.__gdExportInstalled)return;
  ti.__gdExportInstalled=true;
  const original=ti.invoke.bind(ti),pending=new Map();let sequence=0;
  win.__gdExportComplete=function(id,ok,value){const p=pending.get(id);if(!p)return;pending.delete(id);ok?p.resolve(value):p.reject(Error(String(value)));};
  function request(fn){return new Promise((resolve,reject)=>{const id='export-'+(++sequence);pending.set(id,{resolve,reject});try{fn(id)}catch(e){pending.delete(id);reject(e)}});}
  ti.invoke=async function(cmd,args={},options){
   if(cmd==='plugin:dialog|save')return request(id=>bridge.chooseExport(id,String(args.options?.defaultPath||'gardendless-export.json').split(/[\\/]/).pop()));
   if(cmd==='plugin:fs|write_text_file'||cmd==='plugin:fs|write_file'){
    const path=options?.headers?.path?decodeURIComponent(options.headers.path):args.path;
    if(typeof path==='string'&&path.startsWith('gd-export:')){
     let bytes=args;if(typeof bytes==='string')bytes=new TextEncoder().encode(bytes);
     else if(bytes instanceof ArrayBuffer)bytes=new Uint8Array(bytes);
     else if(ArrayBuffer.isView(bytes))bytes=new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
     else if(bytes&&typeof bytes.getReader==='function'){bytes=new Uint8Array(await new Response(bytes).arrayBuffer());}
     else throw Error('Unsupported export payload');
     if(bytes.length>32*1024*1024)throw Error('Export exceeds 32 MiB');
     let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
     return request(id=>bridge.writeExport(id,path,btoa(text)));
    }
   }
   return original(cmd,args,options);
  };
  // Regular game saves use a detached <a download href=blob:...>, followed by
  // immediate revokeObjectURL. Capture the Blob synchronously before that revoke.
  if(win.URL&&win.HTMLAnchorElement&&win.document){
   const blobs=new Map(),active=new WeakSet(),url=win.URL;
   const create=url.createObjectURL.bind(url),revoke=url.revokeObjectURL.bind(url);
   url.createObjectURL=function(blob){const key=create(blob);blobs.set(key,blob);return key;};
   url.revokeObjectURL=function(key){blobs.delete(String(key));return revoke(key);};
   function status(text){
    let el=win.document.getElementById('gd-export-status');
    if(!el){el=win.document.createElement('div');el.id='gd-export-status';el.setAttribute('role','status');el.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;padding:12px;background:#202020;color:#fff;border:1px solid #8bd890;border-radius:8px;pointer-events:none';win.document.body.appendChild(el);}
    el.textContent=text;
   }
   function capture(anchor){
    if(!anchor||!anchor.download)return false;
    const href=anchor.getAttribute('href')||anchor.href||'';
    if(!/^(blob:|data:)/i.test(href))return false;
    if(active.has(anchor))return true;
    active.add(anchor);
    const blob=blobs.get(href),name=String(anchor.download).split(/[\\/]/).pop();
    // Start bytes acquisition now, not after the system picker returns.
    const bytes=blob?blob.arrayBuffer():win.fetch(href).then(r=>{if(!r.ok)throw Error('Cannot read download content');return r.arrayBuffer();});
    const ready=bytes.then(value=>({value}),error=>({error}));
    status('正在准备导出…');
    (async()=>{
     const result=await ready;if(result.error)throw result.error;
     if(result.value.byteLength>32*1024*1024)throw Error('Export exceeds 32 MiB');
     const target=await ti.invoke('plugin:dialog|save',{options:{defaultPath:name}});
     if(target===null){status('已取消导出');return;}
     await ti.invoke('plugin:fs|write_file',new Uint8Array(result.value),{headers:{path:encodeURIComponent(target)}});
     status('导出成功，请到所选位置查看文件');
    })().catch(error=>{status('导出失败：'+String(error.message||error));console.error('[Android export]',error);}).finally(()=>active.delete(anchor));
    return true;
   }
   const click=win.HTMLAnchorElement.prototype.click;
   win.HTMLAnchorElement.prototype.click=function(){if(capture(this))return;return click.apply(this,arguments);};
   win.document.addEventListener('click',function(event){
    const anchor=event.target&&event.target.closest&&event.target.closest('a[download]');
    if(capture(anchor)){event.preventDefault();event.stopImmediatePropagation();}
   },true);
  }
 }
 return {install};
});
