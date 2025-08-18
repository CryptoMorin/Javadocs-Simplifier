# Used for local testing.

import http.server
import socketserver
import webbrowser
import _thread

PORT = 8000
server: socketserver.TCPServer

# class RequestHandler(socketserver.StreamRequestHandler):
class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == '/is_dev':
            self.send_response(200)
            self.end_headers()
            self.send_header('Content-Type', 'text/plain')
            self.wfile.write(b'yes')
        else:
            return super().do_GET()

    def do_POST(self) -> None:
        if self.path == '/reload':
            # This is technically not needed, reloading the page will always request the files
            # even if it's not a force reload.
            print("Initiating reload...")
            
            def kill_yourself_now(server: socketserver.TCPServer):
                server.shutdown()
                print("Shutting down the server...")
                server.shutdown()
                print("Closing the server...")
                server.server_close()
                print("Reloading...")
                run_server()
            
            global server
            _thread.start_new_thread(kill_yourself_now, (server,))

            # TODO - Wait for the reload before answering.
            self.send_response(200, "Reloading...")
            self.end_headers()
        else:
            self.send_error(404, 'Unknown Request')
            self.end_headers()
        
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', f'https://localhost:{PORT}') 
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        # Handle preflight requests for CORS
        self.send_response(200)
        self.end_headers()

def run_server():
    with socketserver.TCPServer(("", PORT), RequestHandler) as httpd:
        print(f"Serving at port {PORT} ...")

        webbrowser.open(f'http://localhost:{PORT}/')
        global server
        server = httpd
        httpd.serve_forever()

run_server()
input("Press Enter to exit")
