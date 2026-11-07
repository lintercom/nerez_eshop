# Lokální objednávkový systém

Spuštění z kořene projektu (Python 3, bez dalších balíčků):

```sh
python3 tools/serve.py
```

Web běží na http://localhost:8000. Server je navázaný pouze na 127.0.0.1.
Objednávky se ukládají do `tmp/orders.sqlite3` mimo veřejnou složku `dist`.
Soubor není určený pro Git a obsahuje kontaktní údaje zadané při testování.
Jiný port nebo databáze: `python3 tools/serve.py --port 8001 --db /tmp/test-orders.sqlite3`.

## Co funguje

- URL navigace pro produkt, košík, dopravu a platbu, zákaznické údaje, kontrolu, potvrzení a kontakty; browser Zpět/Vpřed i obnova stránky.
- Košík v localStorage, rozepsané kontaktní údaje v sessionStorage aktuálního tabu; po dokončení se draft odstraní.
- Nákup bez registrace. Volitelná firma, doručovací adresa jen pro doručení na adresu.
- Osobní odběr zdarma; doprava na adresu má výslovně ukázkovou sazbu 149 Kč. Platba hotově je jen pro odběr, převod pro obě možnosti.
- Server ověřuje položky, celé množství, limity ukázkového skladu, kontakty, adresu a kombinace dopravy a platby.
- Ceny počítá server z katalogu pomocí desetinné aritmetiky. Klientem podstrčenou cenu nebere v úvahu.
- Trvalé uložení SQLite, unikátní číslo, opakování stejného požadavku bez duplicity. Potvrzení se zobrazí až po úspěchu.
- Obnovení potvrzení vyžaduje náhodný token uložený v sessionStorage. Token není v URL. Neexistuje veřejný seznam objednávek.
- Všechny vytvořené objednávky mají režim `development`, stav `test_created` a platbu `unpaid`. Potvrzení lze vytisknout.
- Filtry jsou vložené přímo do katalogu, žádné webové modální okno se nepoužívá.

## Záměrné hranice

Toto je lokální vývojový systém, nikoliv spuštěný prodej. Objednávka se nikam neodesílá a nevytváří skutečnou platební povinnost. Dopravci, platební brány, e-maily, účetnictví a POHODA nejsou propojené. Sklad je ukázka z katalogu a neřeší rezervace mezi více skutečnými objednávkami. Není zapojená administrace ani fakturace. Nelze ho vystavit pro skutečný prodej beze změn.

GitHub Pages umí pouze statický frontend. Pro ukládání objednávek je nezbytný samostatně hostovaný backend a konfigurace jeho adresy. Prosté publikování `dist` proto objednávkový server nezpřístupní. Pokud není backend dostupný, checkout zobrazí chybu a ponechá košík; nesimuluje úspěšnou objednávku v prohlížeči.

Před ostrým provozem je nutné použít schválené obchodní podmínky, reálné ceny a dopravu, živou kontrolu a rezervaci skladu, produkční databázi/zálohy, autorizovanou správu objednávek, potvrzovací e-maily a provozní zabezpečení. Zvolená 149 Kč není cenová nabídka NEREZu.

## Ověření

```sh
python3 tools/test_orders.py
```

Testy mají vlastní dočasnou databázi: ukládání a znovunačtení, přístupový token, deduplikace, změněný požadavek, podstrčená cena, neplatné množství, adresa, platba a kontakty, selhání úložiště.

Průchod v Chrome byl ověřen na izolovaném serveru na portu 8001, včetně ztracené odpovědi po uložení, opakovaného požadavku a obnovy potvrzení. Kontrolní objednávky se neukládají do hlavní lokální databáze.
