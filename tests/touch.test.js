import {test,expect} from 'bun:test';
import fs from 'node:fs';
import vm from 'node:vm';
const kotlin=fs.readFileSync(new URL('../app/src/main/java/com/fct/gardendless/CanvasMouseScript.kt',import.meta.url),'utf8');
const body=kotlin.match(/private val BODY = """([\s\S]*?)"""/)[1];
function fixture(){
 let pointer={x:0,y:0},grid={x:0,y:0},frame=0,hit;
 const log=[],c={dispatchEvent(e){if(e.type==='mousemove')pointer={x:e.clientX,y:e.clientY};log.push({type:e.type,x:e.clientX,y:e.clientY,grid:{...grid},buttons:e.buttons,frame})}};hit=c;
 const window={innerWidth:1000,innerHeight:500};
 const context=vm.createContext({window,document:{getElementById:()=>c,elementFromPoint:()=>hit},console,Promise,
  MouseEvent:class{constructor(type,args){this.type=type;Object.assign(this,args)}},WheelEvent:class{constructor(type,args){this.type=type;Object.assign(this,args)}},
  requestAnimationFrame:fn=>setTimeout(()=>{frame++;grid={...pointer};fn()},0)});
 const fn=vm.runInContext('('+body+')',context);
 return {call:(...args)=>fn(...args),log,window,overlay:()=>{hit={}}};
}
test('tap row 2 uses new position, never cached row 1',async()=>{
 const f=fixture();await f.call('down',.8,.1,true,0);await f.call('up',.8,.1,true,0);
 await f.call('down',.8,.2,true,0);await f.call('up',.8,.2,true,0);
 const downs=f.log.filter(e=>e.type==='mousedown');expect(downs.map(e=>e.grid.y)).toEqual([50,100]);
 expect(downs.map(e=>e.y)).toEqual([50,100]);
});
test('rapid down and up remain ordered and held states match',async()=>{
 const f=fixture();const a=f.call('down',.3,.4,true,0),b=f.call('up',.3,.4,true,0);await Promise.all([a,b]);
 expect(f.log.map(e=>e.type)).toEqual(['mousemove','mousedown','mousemove','mouseup']);
 expect(f.log.map(e=>e.buttons)).toEqual([0,1,1,0]);expect(f.window.__gdCanvasMouse.left).toBe(false);
});
test('HTML overlay does not receive synthetic canvas down',async()=>{
 const f=fixture();f.overlay();await f.call('down',.3,.4,true,0);await f.call('up',.3,.4,true,0);expect(f.log).toEqual([]);
});
test('cancel releases held left button; right click updates target first',async()=>{
 const f=fixture();await f.call('down',.1,.2,true,0);await f.call('cancel',.1,.2,false,0);await f.call('right',.8,.7,false,0);
 expect(f.window.__gdCanvasMouse.left).toBe(false);
 const down=f.log.filter(e=>e.type==='mousedown').at(-1);expect(down.grid).toEqual({x:800,y:350});expect(down.buttons).toBe(2);
});
