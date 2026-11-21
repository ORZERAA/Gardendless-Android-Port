"""Loopback-only diagnostic server: real packaged scripts + disk-backed MODEL of Android bridge.
This is not an Android runtime. Stop with Ctrl+C. Never expose this server on a network.
"""
import http.server, pathlib, zipfile, json, base64, os, stat, argparse
R=pathlib.Path(__file__).resolve().parents[1]
import tempfile
location=R/'.smoke-data-location.txt'
DB=pathlib.Path(location.read_text().strip()) if location.exists() else pathlib.Path(tempfile.mkdtemp(prefix='gd-alpha-'))
DB.mkdir(exist_ok=True);location.write_text(str(DB))
NATIVE='''<script>
window.GardendlessBridge=new Proxy({}, {get:(_,method)=>(...args)=>{
 const x=new XMLHttpRequest();x.open('POST','/__bridge',false);x.setRequestHeader('Content-Type','application/json');x.send(JSON.stringify({method,args}));
 const r=JSON.parse(x.responseText);if(!r.ok)throw Error(r.error);return r.value;
}});
const fetch0=window.fetch;
window.fetch=function(u,o){if(String(u).startsWith('https://appassets.androidplatform.net/gp-next/'))u=new URL(u).pathname;return fetch0.call(this,u,o)};
window.__smokeErrors=[];
window.addEventListener('error',e=>__smokeErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>__smokeErrors.push(String(e.reason?.stack||e.reason)));
</script>'''

def file(p):
    if not isinstance(p,str) or not p.startswith('gp-next') or '\\' in p:raise ValueError('Invalid path')
    parts=p.split('/')
    if parts[0]!='gp-next' or any(x in ('','..','.') for x in parts):raise ValueError('Invalid path')
    f=DB.joinpath(*parts)
    if not f.resolve().is_relative_to(DB.resolve()):raise ValueError('Path escape')
    return f

def bridge(method,args):
    if method=='appDataRoot':return '/data/user/0/com.fct.gardendless.offlinealpha/files'
    if method in ('setFullscreen','setExportName','openDataFolder'):return None
    p=file(args[0]);
    if method=='fsExists':return p.exists()
    if method=='fsMkdir':p.mkdir(parents=True,exist_ok=True);return True
    if method in ('fsWriteText','fsWriteBytes'):
        p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(args[1].encode() if method=='fsWriteText' else base64.b64decode(args[1],validate=True));return True
    if method=='fsRename':q=file(args[1]);q.parent.mkdir(parents=True,exist_ok=True);os.replace(p,q);return True
    if method=='fsRemove':
        import shutil
        if p.is_dir():shutil.rmtree(p)
        elif p.exists():p.unlink()
        return True
    if method=='fsStat':
        if not p.exists():return None
        s=p.lstat();return json.dumps(dict(isFile=p.is_file(),isDirectory=p.is_dir(),isSymlink=p.is_symlink(),size=s.st_size,mtime=int(s.st_mtime*1000),atime=None,birthtime=None))
    if method=='fsReadDir':return json.dumps([dict(name=x.name,isFile=x.is_file(),isDirectory=x.is_dir(),isSymlink=x.is_symlink()) for x in p.iterdir()] if p.is_dir() else [])
    raise ValueError('Unsupported method')

class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            if self.path!='/__bridge' or int(self.headers.get('Content-Length','0'))>100*1024*1024:raise ValueError('Invalid request')
            data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            out={'ok':True,'value':bridge(data['method'],data['args'])}
        except Exception as e:out={'ok':False,'error':str(e)}
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(out).encode())
    def do_GET(self):
        import mimetypes,urllib.parse
        name=urllib.parse.unquote(self.path.split('?')[0]).lstrip('/') or 'index.html'
        try:
            if name=='storage-check.html':
                data=('<html><head>'+NATIVE+'<script>window.isTauri=true;</script><script src="/legacy-polyfill.js"></script><script src="/legacy-shim.js"></script><script src="/android-compat.js"></script><script>GardendlessCompat.install(window);</script></head><body>Storage restart test (no game garbage collection)</body></html>').encode()
            elif name.startswith('gp-next/'):data=file(name).read_bytes()
            else:
                with zipfile.ZipFile(R/'app/src/main/assets/pvzge_web-master.zip') as z:data=z.read('pvzge_web-master/docs/'+name)
            if name=='index.html':data=data.decode().replace('<head>','<head>'+NATIVE,1).encode()
            mime=mimetypes.guess_type(name)[0] or 'application/octet-stream'
            if name.endswith('.js'):mime='text/javascript'
            self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        except (KeyError,FileNotFoundError,ValueError):self.send_error(404)
    def log_message(self,fmt,*args):
        if '404' in str(args): print(fmt%args)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8770);a=p.parse_args()
    print(f'http://127.0.0.1:{a.port}/ (desktop browser + disk bridge MODEL)',flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1',a.port),H).serve_forever()
