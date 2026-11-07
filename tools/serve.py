#!/usr/bin/env python3
"""Local development storefront and persistent test orders; no external services."""
import argparse
import hashlib
import json
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]

class OrderError(Exception):
    pass

class OrderStore:
    def __init__(self, db, catalog=ROOT / 'dist/data/catalog.json'):
        self.db, self.catalog = str(db), catalog
        Path(db).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, token_hash TEXT NOT NULL, payload TEXT NOT NULL)')

    def connect(self):
        return sqlite3.connect(self.db, timeout=15)

    def create(self, data, key, token):
        if not re.fullmatch(r'[a-zA-Z0-9-]{20,80}', key or '') or not re.fullmatch(r'[a-zA-Z0-9-]{20,80}', token or ''):
            raise OrderError('Chybí identifikátor objednávky. Obnovte stránku a zkuste to znovu.')
        if not isinstance(data, dict):
            raise OrderError('Neplatná objednávka.')
        fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        with self.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            existing = conn.execute('SELECT fingerprint, token_hash, payload FROM orders WHERE request_key=?', (key,)).fetchone()
            if existing:
                if existing[0] != fingerprint or existing[1] != token_hash:
                    raise OrderError('Tento požadavek už obsahuje jinou objednávku. Obnovte košík.')
                return json.loads(existing[2])
            customer = data.get('customer')
            if not isinstance(customer, dict):
                raise OrderError('Vyplňte kontaktní údaje.')
            def field(name, required=True, limit=200):
                val = customer.get(name, '')
                if not isinstance(val, str) or len(val) > limit or (required and not val.strip()):
                    raise OrderError('Zkontrolujte pole: ' + name)
                return val.strip()
            buyer = {name: field(name) for name in ('firstName','lastName','email','phone')}
            if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', buyer['email']) or not re.fullmatch(r'\+?[\d ()-]{9,25}', buyer['phone']):
                raise OrderError('Zadejte platný e-mail a telefon.')
            for name in ('company', 'ico', 'street', 'city', 'zip', 'note'):
                buyer[name] = field(name, False, 2000 if name == 'note' else 200)
            if buyer['ico'] and not re.fullmatch(r'\d{8}', buyer['ico']):
                raise OrderError('IČ musí obsahovat 8 číslic.')
            shipping, payment = data.get('shipping'), data.get('payment')
            if shipping not in ('pickup', 'delivery') or payment not in ('cash', 'transfer'):
                raise OrderError('Zvolte dopravu a platbu.')
            if payment == 'cash' and shipping != 'pickup':
                raise OrderError('Platba při převzetí je dostupná pouze pro osobní odběr.')
            if shipping == 'delivery' and (not buyer['street'] or not buyer['city'] or not re.fullmatch(r'\d{3}\s?\d{2}', buyer['zip'])):
                raise OrderError('Doplňte ulici, město a platné PSČ pro doručení.')
            if data.get('accepted') is not True:
                raise OrderError('Potvrďte, že jde o zkušební objednávku.')
            catalog = {str(p['id']): p for p in json.loads(self.catalog.read_text())['products']}
            items, seen, subtotal = [], set(), Decimal('0')
            source = data.get('items')
            if not isinstance(source, list) or not 1 <= len(source) <= 100:
                raise OrderError('Košík je prázdný nebo neplatný.')
            for line in source:
                if not isinstance(line, dict):
                    raise OrderError('Neplatná položka košíku.')
                code, qty = str(line.get('id')), line.get('qty')
                p = catalog.get(code)
                if not p or code in seen or isinstance(qty, bool) or not isinstance(qty, int) or not 1 <= qty <= int(p.get('stock', 0)):
                    raise OrderError('Položka není dostupná v požadovaném množství. Vraťte se do košíku.')
                seen.add(code)
                unit = Decimal(str(p['price'])).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
                amount = unit * qty
                subtotal += amount
                items.append(dict(id=code, code=p['code'], name=p['name'], qty=qty, unit=p['unit'], unitPrice=float(unit), total=float(amount)))
            shipping_price = Decimal('0' if shipping == 'pickup' else '149')
            now = datetime.now(timezone.utc)
            order_id = secrets.token_hex(12)
            order = dict(id=order_id, number='NV-' + now.strftime('%Y%m%d') + '-' + order_id[:6].upper(), createdAt=now.isoformat(), mode='development', status='test_created', paymentStatus='unpaid', customer=buyer, shipping=shipping, payment=payment, items=items, subtotal=float(subtotal), shippingPrice=float(shipping_price), total=float(subtotal+shipping_price), currency='CZK')
            conn.execute('INSERT INTO orders VALUES (?,?,?,?,?)', (order_id, key, fingerprint, token_hash, json.dumps(order, ensure_ascii=False)))
            return order

    def get(self, order_id, token):
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        with self.connect() as conn:
            row = conn.execute('SELECT payload FROM orders WHERE id=? AND token_hash=?', (order_id, token_hash)).fetchone()
        return json.loads(row[0]) if row else None

class Handler(SimpleHTTPRequestHandler):
    def json_response(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/health':
            return self.json_response(200, dict(mode='development', orders=True))
        if path.startswith('/api/orders/'):
            token = self.headers.get('Authorization', '').removeprefix('Bearer ')
            result = self.server.store.get(path.rsplit('/',1)[-1], token)
            return self.json_response(200 if result else 404, result or {'error':'Objednávka nebyla nalezena nebo nemáte přístup.'})
        if path.startswith('/api/'):
            return self.json_response(404, {'error':'Neznámý požadavek.'})
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/orders':
            return self.json_response(404, {'error':'Neznámý požadavek.'})
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.json_response(403, {'error':'Požadavek z cizího webu není povolen.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536:
                raise OrderError('Neplatná velikost objednávky.')
            if 'application/json' not in self.headers.get('Content-Type',''):
                raise OrderError('Neplatný formát objednávky.')
            data = json.loads(self.rfile.read(length))
            order = self.server.store.create(data, self.headers.get('Idempotency-Key'), self.headers.get('X-Order-Token'))
            self.json_response(201, order)
        except (OrderError, ValueError, TypeError) as error:
            self.json_response(400, {'error':str(error) if isinstance(error, OrderError) else 'Neplatné údaje objednávky.'})
        except sqlite3.Error:
            self.json_response(503, {'error':'Objednávku se nepodařilo uložit. Zkuste to znovu; košík zůstává zachován.'})

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--db', type=Path, default=ROOT/'tmp/orders.sqlite3')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT/'dist')))
    server.store = OrderStore(args.db)
    print(f'Local development checkout: http://localhost:{args.port} (SQLite: {args.db})', flush=True)
    server.serve_forever()
