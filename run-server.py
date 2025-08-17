# Used for local testing.

import http.server
import socketserver
import webbrowser

PORT = 8000

# class RequestHandler(socketserver.StreamRequestHandler):
class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == '/reload':
            # This is technically not needed, reloading the page will always request the files
            # even if it's not a force reload.
            print("Reloading...")
            self.send_response(200, "Reloaded")
        else:
            return super().do_GET()

def run_server():
    with socketserver.TCPServer(("", PORT), RequestHandler) as httpd:
        print(f"Serving at port {PORT} ...")

        webbrowser.open(f'http://localhost:{PORT}/')
        httpd.serve_forever()

run_server()
input("Press Enter to exit")
