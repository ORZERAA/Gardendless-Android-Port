import clone from '@ungap/structured-clone';
// MIT licensed dependency; only fill missing native APIs.
if(typeof globalThis.structuredClone!=='function')globalThis.structuredClone=function(value,options){
 if(options?.transfer?.length)throw new DOMException('Transfer lists are unsupported by this fallback','DataCloneError');
 return clone(value);
};
if(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout!=='function')AbortSignal.timeout=function(ms){
 if(!Number.isFinite(ms)||ms<0)throw new RangeError('Invalid timeout');
 const c=new AbortController();setTimeout(()=>c.abort(new DOMException('The operation timed out','TimeoutError')),ms);return c.signal;
};
if(globalThis.crypto&&typeof crypto.randomUUID!=='function'&&crypto.getRandomValues)crypto.randomUUID=function(){
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const s=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);
};
