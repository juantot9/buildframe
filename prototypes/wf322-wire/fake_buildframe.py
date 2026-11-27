# PROTOTYPE, throwaway (WF-322). A stand-in for BuildFrame's side of the proposed v1 wire:
# JSON-RPC 2.0, one message per line, same-user Unix socket. Prints every frame.
import json, os, socket, sys, tempfile, hashlib, threading
sock_path = os.path.join(tempfile.mkdtemp(), "w-proto.sock")
endpoint = {"protocol": "buildframe.integration/1", "transport": "unix", "path": sock_path}
open(sys.argv[1], "w").write(json.dumps(endpoint))  # what `bframe endpoint --json` would print
srv = socket.socket(socket.AF_UNIX); srv.bind(sock_path); os.chmod(sock_path, 0o600); srv.listen(1)
conn, _ = srv.accept(); f = conn.makefile("rwb"); next_id = 100; done = threading.Event()
def send(obj): print("BF  ->", json.dumps(obj)); f.write((json.dumps(obj) + "\n").encode()); f.flush()
def request(method, params):
    global next_id; next_id += 1; send({"jsonrpc": "2.0", "id": next_id, "method": method, "params": params})
for line in f:
    msg = json.loads(line); print("BF  <-", json.dumps(msg))
    method = msg.get("method")
    if method == "buildframe/initialize":
        m = msg["params"]["manifest"]
        send({"jsonrpc": "2.0", "id": msg["id"], "result": {"protocolVersion": 1, "trust": "unverified",
              "workspace": "demo-checkout"}})
        print(f"BF  shows: {m['name']} {m['version']} · {m['level']} · unverified")
        text = "Rename `fetchAll` to `loadAll` in src/api.ts:42.\nKeep the old name as an alias."
        request("message/deliver", {"messageId": "msg-1", "text": text,
                                    "sha256": hashlib.sha256(text.encode()).hexdigest()})
    elif method in ("turn/started", "turn/ended", "session/status"):
        send({"jsonrpc": "2.0", "id": msg["id"], "result": {"applied": True}})
        if method == "turn/ended" and msg["params"]["messageId"] == "msg-1":
            request("message/deliver", {"messageId": "msg-2", "text": "Also add a test.",
                                        "sha256": hashlib.sha256(b"Also add a test.").hexdigest()})
        if method == "turn/started" and msg["params"]["messageId"] == "msg-2":
            request("turn/interrupt", {"messageId": "msg-2"})
        if method == "turn/ended" and msg["params"]["messageId"] == "msg-2":
            break
conn.close(); os.unlink(sock_path); print("BF  done")
