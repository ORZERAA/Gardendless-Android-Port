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
 }
 return {install};
});
