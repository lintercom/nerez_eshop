"""Order persistence and trust-boundary checks using an isolated database."""
import copy
import json
import tempfile
import unittest
import uuid
from pathlib import Path
from serve import OrderStore, OrderError

class OrdersTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = OrderStore(Path(self.tmp.name)/'orders.sqlite3')
        self.key, self.token = str(uuid.uuid4()), str(uuid.uuid4())
        self.payload = dict(items=[dict(id='10001',qty=1)], shipping='pickup', payment='cash', accepted=True,
            customer=dict(firstName='Test',lastName='Zákazník',email='test@example.invalid',phone='+420123456789'))

    def tearDown(self): self.tmp.cleanup()
    def create(self, payload=None): return self.store.create(payload or self.payload,self.key,self.token)

    def test_persisted_and_authorized(self):
        order = self.create()
        self.assertEqual(order['total'],113.74)
        reopened = OrderStore(self.store.db)
        self.assertEqual(reopened.get(order['id'],self.token),order)
        self.assertIsNone(reopened.get(order['id'],'wrong-token'))
        self.assertEqual(order['paymentStatus'],'unpaid')

    def test_retry_is_idempotent(self):
        self.assertEqual(self.create()['id'],self.create()['id'])
        with self.store.connect() as conn:self.assertEqual(conn.execute('SELECT COUNT(*) FROM orders').fetchone()[0],1)

    def test_key_cannot_be_reused_for_changed_payload(self):
        self.create()
        changed=copy.deepcopy(self.payload);changed['customer']['firstName']='Jiný'
        with self.assertRaises(OrderError):self.create(changed)

    def test_prices_come_from_catalog(self):
        self.payload['total']=0
        self.payload['items'][0]['price']=0.01
        self.assertEqual(self.create()['total'],113.74)

    def test_quantity_and_duplicates_rejected(self):
        for items in [[dict(id='10001',qty=2)],[dict(id='10001',qty=0)],[dict(id='10001',qty=True)],[dict(id='missing',qty=1)],[dict(id='10001',qty=1)]*2,[]]:
            with self.subTest(items=items),self.assertRaises(OrderError):
                payload=copy.deepcopy(self.payload);payload['items']=items;self.create(payload)

    def test_delivery_and_payment_rules(self):
        self.payload.update(shipping='delivery',payment='transfer')
        with self.assertRaises(OrderError):self.create()
        self.payload['customer'].update(street='Testovací 1',city='Vizovice',zip='763 12')
        self.assertEqual(self.create()['total'],262.74)
        self.key=str(uuid.uuid4());self.payload['payment']='cash'
        with self.assertRaises(OrderError):self.create()

    def test_customer_and_consent_validation(self):
        for key,value in [('email','bad'),('phone','123'),('firstName',''),('ico','123')]:
            payload=copy.deepcopy(self.payload);payload['customer'][key]=value
            with self.subTest(key=key),self.assertRaises(OrderError):self.create(payload)
        self.payload['accepted']=False
        with self.assertRaises(OrderError):self.create()

    def test_failed_storage_does_not_create_confirmation(self):
        with self.store.connect() as conn:conn.execute('DROP TABLE orders')
        import sqlite3
        with self.assertRaises(sqlite3.Error):self.create()

if __name__=='__main__':unittest.main()
