import {test,expect} from 'bun:test';
import fs from 'node:fs';import vm from 'node:vm';
const script=fs.readFileSync(new URL('../compat/android-dialogs.js',import.meta.url),'utf8');
function fixture(width,height){
 const props={},header={style:{}},button={style:{}},body={style:{setProperty(k,v){this[k]=v}},matches:()=>true};
 const dialog={style:{setProperty(k,v,p){props[k]=[v,p]},getPropertyValue:k=>props[k]?.[0],getPropertyPriority:k=>props[k]?.[1]},querySelector:s=>s.includes('header')?header:button,children:[header,body],close(){this.closed=true}};
 const window={innerWidth:width,innerHeight:height,addEventListener(){}};
 const document={body:{},querySelectorAll:()=>[dialog]};
 vm.runInNewContext(script,{window,document,MutationObserver:class{observe(){}},Math,Object});
 return {props,dialog,window,button,body};
}
test('landscape dialog has explicit nonzero pixel height and visible touch close',()=>{
 const f=fixture(760,342);expect(f.props.height[0]).toBe('326px');expect(f.props.width[0]).toBe('744px');expect(f.props.top[0]).toBe('8px');expect(f.button.style.minHeight).toBe('44px');expect(f.body.style.overflow).toBe('auto');
});
test('portrait sizing stays bounded by viewport and maximum',()=>{
 const f=fixture(390,844);expect(f.props.width[0]).toBe('374px');expect(f.props.height[0]).toBe('800px');
});
test('native back hook closes top dialog',()=>{
 const f=fixture(760,342);expect(f.window.__gdCloseTopDialog()).toBe(true);expect(f.dialog.closed).toBe(true);
});
