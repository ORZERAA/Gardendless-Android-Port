"""Package extracted 0.16.26 frontend without modifying the source directory.
Usage: python tools/prepare_game.py --game-dir <extracted-folder>
"""
import argparse, pathlib, json, zipfile, hashlib, re, tempfile, os
ROOT=pathlib.Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--game-dir',required=True,type=pathlib.Path)
    args=parser.parse_args(); game=args.game_dir.resolve()
    info=json.loads((game/'app-info.json').read_text(encoding='utf-8'))
    if info.get('Version')!='0.16.26':raise ValueError('This adapter was tested against 0.16.26 only')
    scripts=['webview-platform.js','legacy-polyfill.js','legacy-shim.js','android-compat.js','android-export.js','android-dialogs.js']
    html=(game/'index.html').read_text(encoding='utf-8')
    if '__gdCompatVersion' in html or 'android-compat.js' in html:raise ValueError('Input appears already patched')
    injection='''
  <!-- Offline alpha: synchronous compatibility initialization before Vite modules. -->
  <script src="/webview-platform.js"></script>
  <script>window.isTauri=true;window.__gdForceJsModding=false;</script>
  <script src="/legacy-polyfill.js"></script>
  <script src="/legacy-shim.js"></script>
  <script src="/android-compat.js"></script>
  <script>GardendlessCompat.install(window);</script>
  <script src="/android-export.js"></script>
  <script src="/android-dialogs.js"></script>
'''
    # Block duplicate native touches only on GameCanvas. MouseGameWebView supplies mouse events.
    # Install before engine load instead of a fixed eight-second timeout.
    touch='''
  <script>
    (function(){const c=document.getElementById('GameCanvas');
      for(const type of ['touchstart','touchmove','touchend','touchcancel'])
        c.addEventListener(type,e=>{e.preventDefault();e.stopImmediatePropagation();},{capture:true,passive:false});
    })();
  </script>
'''
    html=html.replace('<head>','<head>'+injection,1).replace('</body>',touch+'</body>',1)
    target=ROOT/'app/src/main/assets/pvzge_web-master.zip'; target.parent.mkdir(parents=True,exist_ok=True)
    tmp=target.with_suffix('.zip.pending'); manifest={}
    try:
        with zipfile.ZipFile(tmp,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
            for file in sorted(game.rglob('*')):
                if file.is_symlink():raise ValueError('Symlink in source')
                if not file.is_file():continue
                rel=file.relative_to(game).as_posix()
                if rel in scripts:raise ValueError('Input includes conflicting adapter filename')
                if rel=='tauri-dumper.manifest.json':continue
                data=html.encode('utf-8') if rel=='index.html' else file.read_bytes()
                if rel in ('docs/about.zh.md','docs/about.en.md'):
                    language='zh' if rel.endswith('.zh.md') else 'en'
                    addition=(ROOT/'compat'/f'about-adaptation.{language}.md').read_text(encoding='utf-8')
                    original=data.decode('utf-8')
                    title, separator, rest=original.partition('\n')
                    data=(title+'\n\n'+addition+rest).encode('utf-8')
                z.writestr('pvzge_web-master/docs/'+rel,data)
                manifest[rel]=hashlib.sha256(data).hexdigest()
            for name in scripts:
                data=(ROOT/'compat'/name).read_bytes()
                z.writestr('pvzge_web-master/docs/'+name,data);manifest[name]=hashlib.sha256(data).hexdigest()
            z.writestr('pvzge_web-master/docs/android-port.json',json.dumps({'version':'0.16.26-offline-alpha5-webviewfix','offline':True},indent=2))
        os.replace(tmp,target)
    finally:tmp.unlink(missing_ok=True)
    (ROOT/'game-package-manifest.json').write_text(json.dumps({'version':info['Version'],'files':manifest},indent=2),encoding='utf-8')
    print(f'Packaged {len(manifest)+1} files: {target} ({target.stat().st_size:,} bytes)')

if __name__=='__main__':main()
