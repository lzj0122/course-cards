# 用法：python tools/serve.py —— 本地 dev server，修正 .mjs MIME（python -m http.server 默认 text/plain 会触发模块 MIME 校验失败）。
import http.server
import socketserver

PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.mjs': 'text/javascript',
        '.js': 'text/javascript',
    }


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
    print(f'serving http://127.0.0.1:{PORT}/ (mjs=text/javascript)')
    httpd.serve_forever()