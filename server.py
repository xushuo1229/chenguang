"""
晨光自律台 · 开发服务器（替代 python -m http.server）
------------------------------------------------------------
用法:  python server.py [端口]     （默认 8080）

与默认 http.server 的区别：
  - HTML 文档: Cache-Control: no-cache（每次协商，杜绝改版后浏览器拿到旧页面）
  - 带版本参数的静态资源 (js/css/字体/图片): 长缓存
  - 其余静态资源: no-cache
"""
import http.server
import re
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

HTML_RE = re.compile(r"\.(html?)$", re.I)
VERSIONED_RE = re.compile(r"\?[v=]|[\w-]+\.(js|css|woff2?|ttf|svg|png|jpe?g|ico)$", re.I)


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        path = self.path.split("?")[0]
        if HTML_RE.search(path):
            # HTML 文档始终协商缓存：有更新立即生效
            self.send_header("Cache-Control", "no-cache")
        elif VERSIONED_RE.search(self.path):
            # 带版本号的静态资源可以长缓存
            self.send_header("Cache-Control", "public, max-age=604800")
        else:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("0.0.0.0", PORT), Handler) as httpd:
        print(f"✅ 晨光自律台前端已启动: http://localhost:{PORT}/index.html")
        sys.stdout.flush()
        httpd.serve_forever()
