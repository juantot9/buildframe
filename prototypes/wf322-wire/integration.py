# PROTOTYPE, throwaway (WF-322). What an outside author would write for the "full" level,
# stdlib only. The "harness" here is fake: it echoes and sleeps instead of running an agent.
import json, socket, subprocess, sys, threading, time, hashlib

endpoint = json.load(open(sys.argv[1]))  # real: json.loads(subprocess.check_output(["bframe","endpoint","--json"]))
sock = socket.socket(socket.AF_UNIX); sock.connect(endpoint["path"])
f = sock.makefile("rwb"); lock = threading.Lock(); ids = iter(range(1, 10**9)); pending = {}

def write(obj):
    with lock: f.write((json.dumps(obj) + "\n").encode()); f.flush()

def call(method, params):  # request from us; BuildFrame acknowledges each one
    rid = next(ids); ev = threading.Event(); pending[rid] = [ev, None]
    write({"jsonrpc": "2.0", "id": rid, "method": method, "params": params}); ev.wait()
    return pending.pop(rid)[1]

interrupted = set()

def run_turn(message_id, text):  # stand-in for "submit text to my harness and watch the turn"
    call("turn/started", {"messageId": message_id})
    call("session/status", {"state": "busy"})
    for _ in range(10):
        if message_id in interrupted: break
        time.sleep(0.05)
    if message_id in interrupted:
        call("turn/ended", {"messageId": message_id, "stopReason": "cancelled"})
    else:
        call("turn/ended", {"messageId": message_id, "stopReason": "end_turn",
                            "answer": f"Done: {text.splitlines()[0]}"})
    call("session/status", {"state": "idle"})

def handle(msg):
    method, params = msg.get("method"), msg.get("params", {})
    if method == "message/deliver":
        if hashlib.sha256(params["text"].encode()).hexdigest() != params["sha256"]:
            return write({"jsonrpc": "2.0", "id": msg["id"], "result": {"notDelivered": {"reason": "text-mismatch"}}})
        write({"jsonrpc": "2.0", "id": msg["id"], "result": {"accepted": True}})
        threading.Thread(target=run_turn, args=(params["messageId"], params["text"])).start()
    elif method == "turn/interrupt":
        interrupted.add(params["messageId"])
        write({"jsonrpc": "2.0", "id": msg["id"], "result": {"interrupting": True}})
    else:
        write({"jsonrpc": "2.0", "id": msg["id"], "error": {"code": -32601, "message": "method not found"}})

def reader():
    for line in f:
        msg = json.loads(line)
        if "method" in msg: handle(msg)
        elif msg.get("id") in pending:
            pending[msg["id"]][1] = msg.get("result", msg.get("error")); pending[msg["id"]][0].set()

threading.Thread(target=reader, daemon=True).start()
print("init:", call("buildframe/initialize", {"protocolVersion": 1, "manifest": {
    "name": "proto-harness", "version": "0.0.1", "level": "full", "canInterrupt": True}}))
while True:
    try: time.sleep(0.2); sock.getpeername()
    except OSError: break
    if f.closed: break
