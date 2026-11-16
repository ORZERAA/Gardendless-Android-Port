package com.fct.gardendless

/** The same script body is exercised by the JS regression tests. */
object CanvasMouseScript {
    fun call(kind: String, nx: Float, ny: Float, held: Boolean, delta: Float): String =
        "($BODY)('$kind',$nx,$ny,$held,$delta);"

    private val BODY = """
function(kind,nx,ny,held,delta){
    var run=async function(){
    var c=document.getElementById('GameCanvas');
    if(!c)return;
    var x=nx*window.innerWidth,y=ny*window.innerHeight;
    var s=window.__gdCanvasMouse||(window.__gdCanvasMouse={left:false,x:x,y:y});
    var hit=document.elementFromPoint(x,y);
    var onCanvas=hit===c;
    if(kind==='down'&&!onCanvas)return;
    if(kind==='move'&&!s.left)return;
    if((kind==='up'||kind==='cancel')&&!s.left)return;
    if((kind==='right'||kind==='wheel')&&!onCanvas)return;
    function mouse(type,button,buttons){
        c.dispatchEvent(new MouseEvent(type,{view:window,bubbles:true,cancelable:true,
            clientX:x,clientY:y,screenX:x,screenY:y,button:button,buttons:buttons}));
    }
    // Gardendless Mouse.ts only updates its cached position on MOUSE_MOVE.
    // Lawn row/column is recomputed in update(), not in the mousemove listener.
    // Leave a complete render turn between position and button dispatch.
    var settle=function(){return new Promise(function(resolve){
        requestAnimationFrame(function(){requestAnimationFrame(resolve);});
    });};
    if(kind==='down'){
        mouse('mousemove',0,0);await settle();s.left=true;mouse('mousedown',0,1);
    }else if(kind==='move'){
        mouse('mousemove',0,1);
    }else if(kind==='up'||kind==='cancel'){
        mouse('mousemove',0,1);await settle();s.left=false;mouse('mouseup',0,0);
    }else if(kind==='right'){
        mouse('mousemove',0,0);await settle();mouse('mousedown',2,2);mouse('mouseup',2,0);
    }else if(kind==='wheel'){
        mouse('mousemove',0,0);
        c.dispatchEvent(new WheelEvent('wheel',{view:window,bubbles:true,cancelable:true,
            clientX:x,clientY:y,deltaX:0,deltaY:delta,deltaMode:0}));
    }
    s.x=x;s.y=y;
    };
    // A quick tap must not enqueue mouseup ahead of the delayed mousedown.
    window.__gdMouseQueue=(window.__gdMouseQueue||Promise.resolve()).then(run).catch(function(e){
        console.error('[Android touch]',e);
    });
    return window.__gdMouseQueue;
}
""".trimIndent()
}
