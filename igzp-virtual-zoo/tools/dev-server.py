"""Local static server for development.

Serves the project root and accepts POST /__shot?name=<name> (JPEG body) from the
in-page test hook `IGZP.shot(name)`, saving to docs/screenshots/<name>.jpg.
Not used in production (Vercel serves the static files directly).

Usage: python tools/dev-server.py [port]
"""
import http.server, os, re, sys
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'docs', 'screenshots')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != '/__shot':
            self.send_error(404); return
        name = re.sub(r'[^a-zA-Z0-9_-]', '', parse_qs(u.query).get('name', ['shot'])[0]) or 'shot'
        n = int(self.headers.get('Content-Length', 0))
        os.makedirs(SHOTS, exist_ok=True)
        with open(os.path.join(SHOTS, name + '.jpg'), 'wb') as f:
            f.write(self.rfile.read(n))
        self.send_response(204); self.end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
