import http.server
import socketserver

PORT = 5002
Handler = http.server.SimpleHTTPRequestHandler

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
    print("serving at port", PORT)
    httpd.serve_forever()
