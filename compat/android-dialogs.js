// Android WebView dialog sizing: independent of dvh and intrinsic flex sizing.
(function () {
    'use strict';
    if (window.__gdDialogsInstalled) return;
    window.__gdDialogsInstalled = true;
    function viewport() {
        const v = window.visualViewport;
        return {width: Math.max(1, Math.floor(v ? v.width : window.innerWidth)),
            height: Math.max(1, Math.floor(v ? v.height : window.innerHeight)),
            left: v ? v.offsetLeft : 0, top: v ? v.offsetTop : 0};
    }
    function fit(dialog) {
        const v = viewport(), gap = 8;
        const width = Math.max(1, Math.min(900, v.width - gap * 2));
        const height = Math.max(1, Math.min(800, v.height - gap * 2));
        const css = {position:'fixed',boxSizing:'border-box',display:'flex',flexDirection:'column',
            width:width+'px',height:height+'px',minHeight:'0px',maxHeight:height+'px',maxWidth:width+'px',
            left:(v.left+(v.width-width)/2)+'px',top:(v.top+(v.height-height)/2)+'px',
            right:'auto',bottom:'auto',margin:'0px',padding:'0px',overflow:'hidden',transform:'none'};
        for (const [key,value] of Object.entries(css)) {
            const name=key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());
            if(dialog.style.getPropertyValue(name)!==value||dialog.style.getPropertyPriority(name)!=='important')
                dialog.style.setProperty(name,value,'important');
        }
        const header=dialog.querySelector('.game-dialog-header');
        if(header){header.style.flex='0 0 auto';header.style.padding='8px 12px';}
        const close=dialog.querySelector('.game-dialog-close');
        if(close){close.style.minWidth='44px';close.style.minHeight='44px';close.style.touchAction='manipulation';}
        for(const child of dialog.children){
            if(child===header)continue;
            if(child.matches('.game-markdown,.game-github,.game-music-body,iframe')){
                child.style.setProperty('min-height','0','important');
                child.style.setProperty('flex','1 1 0px','important');
                child.style.setProperty('max-height','none','important');
                child.style.setProperty('overflow','auto','important');
                child.style.setProperty('touch-action','pan-y','important');
            }
        }
    }
    function refresh(){document.querySelectorAll('dialog.game-dialog[open]').forEach(fit);}
    function start(){
        new MutationObserver(refresh).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','class']});
        refresh();
    }
    window.__gdCloseTopDialog=function(){
        const list=document.querySelectorAll('dialog[open]');
        const top=list[list.length-1];if(!top)return false;top.close();return true;
    };
    window.addEventListener('resize',refresh);
    if(window.visualViewport){window.visualViewport.addEventListener('resize',refresh);window.visualViewport.addEventListener('scroll',refresh);}
    if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
