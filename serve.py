import http.server
import socket
import socketserver
from pathlib import Path

PORT = 80
ROOT = Path(__file__).resolve().parent / "Test"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        # Строка лога пишется до статуса HTTP. Мёртвая консоль не должна рвать ответ.
        try:
            super().log_message(format, *args)
        except (OSError, ValueError):
            pass


def lan_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if not ip.startswith("127."):
            ips.append(ip)
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except OSError:
        pass
    return ips


if __name__ == "__main__":
    print("Корень:", ROOT, flush=True)
    print("С этого ПК:  http://127.0.0.1:%s/" % PORT, flush=True)
    for ip in lan_ips():
        print("В локалке:    http://%s:%s/" % (ip, PORT), flush=True)
    print("Стоп: Ctrl+C", flush=True)
    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    with Server(("0.0.0.0", PORT), Handler) as httpd:
        httpd.serve_forever()
