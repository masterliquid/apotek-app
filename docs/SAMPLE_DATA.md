# Sample data — "Apotek Contoh Sehat"

Created by `docker-compose exec app node dist/seed-sample.mjs` (or `pnpm seed:sample` on the host). It makes a pharmacy with code `SAMPLE` owned by the user in `SEED_ADMIN_USERNAME` (your admin), so you log in with your normal account and open **Apotek Contoh Sehat**. Running it again changes nothing.

**What it contains**
- 58 products in 9 categories, with pack units (e.g. Strip = 10 tablets, Box = 12 sachets). Each product's price is a retail-style price per pack; the base-unit price is derived from it.
- 5 sample suppliers (fictional PBF names, fake phone numbers) and 8 sample customers (fictional people).
- Opening stock received through real purchase orders and goods receipts (5 POs, 115 batches). Most products have an older and a newer batch (the POS sells the older one first); a few batches expire within weeks so the dashboard expiry alert has something to show.
- Barcodes are generated sample EAN-13 codes (prefix `899`, valid check digit). They are **not** the products' real barcodes. Type or scan them in the POS search, or just type part of the name.

**Where prices come from**
- From online pharmacy listings (K24Klik, Halodoc, Watsons; 2026 snapshots, prices vary by shop and date): Paracetamol (generic strip), Panadol Biru, Bodrex, Bodrex Extra, Paramex, Paramex Nyeri Otot, Neozep F, Mylanta cair 50 / 150 ml, OBH Combi, Tolak Angin Cair (box of 12), Counterpain Cool Gel 15 / 30 g, Hansaplast koyo, Betadine sabun cair, Enervon-C, IPI Vitamin C, Redoxon Triple Action and Zinc, Amoxicillin 500 mg, Amlodipine 10 mg.
- Everything else is a reasonable estimate, only to make the sample realistic. Cost price is derived from the selling price with the legacy rule (cost + 10% = buy price, plus 25% margin).
- The categories (Obat Bebas, Obat Keras, …) are illustrative, not a regulatory reference. The app has no prescription feature yet.

**Product list**

| Barcode | Product | Category | Price per base unit | Pack units (price) | Stock (base units) | First expiry |
|---|---|---|---|---|---|---|
| 8991000000539 | Hand Sanitizer 60 ml | Alat Kesehatan | Rp 12.000 / Botol |  | 24 | 2027-02-22 |
| 8991000000522 | Masker Medis 3 Ply | Alat Kesehatan | Rp 500 / Pcs | Pak x50 = Rp 25.000 | 500 | 2026-12-31 |
| 8991000000553 | Tensimeter Digital | Alat Kesehatan | Rp 350.000 / Pcs |  | 3 | 2028-04-21 |
| 8991000000546 | Termometer Digital | Alat Kesehatan | Rp 35.000 / Pcs |  | 10 | 2027-04-16 |
| 8991000000577 | Bedak Bayi 100 g | Bayi & Ibu | Rp 15.000 / Pot |  | 24 | 2027-04-25 |
| 8991000000560 | Minyak Telon Lang 60 ml | Bayi & Ibu | Rp 22.000 / Botol |  | 24 | 2027-03-03 |
| 8991000000416 | Antangin JRG Sachet | Herbal & Jamu | Rp 2.800 / Sachet | Box x12 = Rp 33.600 | 120 | 2027-01-17 |
| 8991000000423 | Minyak Kayu Putih Cap Lang 60 ml | Herbal & Jamu | Rp 24.000 / Botol |  | 24 | 2027-03-11 |
| 8991000000409 | Tolak Angin Cair 15 ml | Herbal & Jamu | Rp 4.763,08 / Sachet | Box x12 = Rp 57.157 | 240 | 2027-04-24 |
| 8991000000584 | Vaseline Petroleum Jelly 50 g | Kosmetik | Rp 14.000 / Pot |  | 24 | 2027-01-18 |
| 8991000000164 | Antasida DOEN Tablet | Obat Bebas | Rp 400 / Tablet | Strip x10 = Rp 4.000 | 400 | 2027-02-11 |
| 8991000000041 | Bodrex Extra | Obat Bebas | Rp 725,75 / Tablet | Strip x4 = Rp 2.903 | 240 | 2027-01-06 |
| 8991000000034 | Bodrex Tablet | Obat Bebas | Rp 561 / Tablet | Strip x10 = Rp 5.610 | 400 | 2027-04-13 |
| 8991000000485 | Counterpain Cool Gel 15 g | Obat Bebas | Rp 32.111 / Tube |  | 12 | 2027-03-29 |
| 8991000000492 | Counterpain Cool Gel 30 g | Obat Bebas | Rp 51.403 / Tube |  | 8 | 2027-05-21 |
| 8991000000157 | Mylanta Cair 150 ml | Obat Bebas | Rp 54.406 / Botol |  | 12 | 2027-05-19 |
| 8991000000140 | Mylanta Cair 50 ml | Obat Bebas | Rp 20.253 / Botol |  | 24 | 2027-03-27 |
| 8991000000225 | Oralit Sachet | Obat Bebas | Rp 2.000 / Sachet |  | 100 | 2027-03-01 |
| 8991000000072 | Oskadon Tablet | Obat Bebas | Rp 650 / Tablet | Strip x4 = Rp 2.600 | 200 | 2027-01-15 |
| 8991000000027 | Panadol Biru 500 mg | Obat Bebas | Rp 1.420 / Tablet | Strip x10 = Rp 14.200 | 300 | 2027-02-19 |
| 8991000000010 | Paracetamol 500 mg | Obat Bebas | Rp 350 / Tablet | Strip x10 = Rp 3.500 | 1000 | 2026-12-28 |
| 8991000000065 | Paramex Nyeri Otot | Obat Bebas | Rp 612,5 / Tablet | Strip x4 = Rp 2.450 | 200 | 2027-04-22 |
| 8991000000058 | Paramex Tablet | Obat Bebas | Rp 802,25 / Tablet | Strip x4 = Rp 3.209 | 240 | 2027-02-28 |
| 8991000000133 | Promag Tablet | Obat Bebas | Rp 850 / Tablet | Strip x10 = Rp 8.500 | 300 | 2027-02-02 |
| 8991000000102 | Sanmol Tablet 500 mg | Obat Bebas | Rp 700 / Tablet | Strip x10 = Rp 7.000 | 200 | 2027-01-24 |
| 8991000000324 | Cetirizine 10 mg | Obat Bebas Terbatas | Rp 700 / Tablet | Strip x10 = Rp 7.000 | 300 | 2027-05-20 |
| 8991000000096 | Decolgen Tablet | Obat Bebas Terbatas | Rp 750 / Tablet | Strip x4 = Rp 3.000 | 200 | 2027-05-01 |
| 8991000000119 | Ibuprofen 400 mg | Obat Bebas Terbatas | Rp 500 / Tablet | Strip x10 = Rp 5.000 | 300 | 2027-03-18 |
| 8991000000195 | Komix Herbal Sachet | Obat Bebas Terbatas | Rp 1.800 / Sachet | Box x12 = Rp 21.600 | 120 | 2027-02-20 |
| 8991000000331 | Loratadine 10 mg | Obat Bebas Terbatas | Rp 900 / Tablet | Strip x10 = Rp 9.000 | 200 | 2027-02-12 |
| 8991000000089 | Neozep F Tablet | Obat Bebas Terbatas | Rp 887,5 / Tablet | Strip x4 = Rp 3.550 | 200 | 2026-11-22 |
| 8991000000188 | OBH Combi Batuk Flu Madu 60 ml | Obat Bebas Terbatas | Rp 21.356 / Botol |  | 24 | 2026-12-29 |
| 8991000000201 | Ambroxol 30 mg | Obat Keras | Rp 400 / Tablet | Strip x10 = Rp 4.000 | 300 | 2027-04-14 |
| 8991000000263 | Amlodipine 10 mg | Obat Keras | Rp 1.030 / Tablet | Strip x10 = Rp 10.300 | 300 | 2027-05-02 |
| 8991000000270 | Amlodipine 5 mg | Obat Keras | Rp 500 / Tablet | Strip x10 = Rp 5.000 | 300 | 2027-01-25 |
| 8991000000232 | Amoxicillin 500 mg | Obat Keras | Rp 900 / Tablet | Strip x10 = Rp 9.000 | 500 | 2027-04-23 |
| 8991000000126 | Asam Mefenamat 500 mg | Obat Keras | Rp 600 / Tablet | Strip x10 = Rp 6.000 | 300 | 2027-05-10 |
| 8991000000287 | Captopril 25 mg | Obat Keras | Rp 400 / Tablet | Strip x10 = Rp 4.000 | 300 | 2027-03-19 |
| 8991000000249 | Cefadroxil 500 mg | Obat Keras | Rp 2.500 / Kapsul | Strip x10 = Rp 25.000 | 200 | 2027-01-16 |
| 8991000000256 | Ciprofloxacin 500 mg | Obat Keras | Rp 1.800 / Tablet | Strip x10 = Rp 18.000 | 200 | 2027-03-10 |
| 8991000000317 | Dexamethasone 0,5 mg | Obat Keras | Rp 300 / Tablet | Strip x10 = Rp 3.000 | 300 | 2027-03-28 |
| 8991000000294 | Metformin 500 mg | Obat Keras | Rp 400 / Tablet | Strip x10 = Rp 4.000 | 500 | 2027-05-11 |
| 8991000000171 | Omeprazole 20 mg | Obat Keras | Rp 1.500 / Kapsul | Strip x10 = Rp 15.000 | 300 | 2027-04-05 |
| 8991000000218 | Salbutamol 4 mg | Obat Keras | Rp 300 / Tablet | Strip x10 = Rp 3.000 | 200 | 2027-01-07 |
| 8991000000300 | Simvastatin 20 mg | Obat Keras | Rp 1.200 / Tablet | Strip x10 = Rp 12.000 | 200 | 2027-02-03 |
| 8991000000508 | Alkohol 70% 100 ml | Perawatan Luka | Rp 8.000 / Botol |  | 30 | 2027-02-13 |
| 8991000000447 | Betadine Antiseptic Solution 15 ml | Perawatan Luka | Rp 18.000 / Botol |  | 24 | 2027-01-26 |
| 8991000000430 | Betadine Sabun Cair 100 ml | Perawatan Luka | Rp 54.766 / Botol |  | 10 | 2027-05-03 |
| 8991000000478 | Hansaplast Koyo Hangat Renceng | Perawatan Luka | Rp 3.124 / Pcs |  | 120 | 2027-02-04 |
| 8991000000461 | Hansaplast Koyo Panas | Perawatan Luka | Rp 11.942 / Pcs |  | 40 | 2027-05-12 |
| 8991000000454 | Hansaplast Plester Classic | Perawatan Luka | Rp 400 / Pcs | Box x10 = Rp 4.000 | 100 | 2027-03-20 |
| 8991000000515 | Kapas Steril 100 g | Perawatan Luka | Rp 12.000 / Pcs |  | 20 | 2027-04-07 |
| 8991000000348 | Enervon-C | Vitamin & Suplemen | Rp 1.473,5 / Tablet | Strip x4 = Rp 5.894; Botol x30 = Rp 44.205 | 360 | 2027-04-06 |
| 8991000000355 | IPI Vitamin C 500 mg | Vitamin & Suplemen | Rp 166,67 / Tablet | Botol x45 = Rp 7.500 | 450 | 2026-12-30 |
| 8991000000362 | Redoxon Triple Action Effervescent | Vitamin & Suplemen | Rp 5.830 / Tablet | Tube x10 = Rp 58.300 | 50 | 2027-02-21 |
| 8991000000379 | Redoxon Zinc Effervescent Orange | Vitamin & Suplemen | Rp 5.697,5 / Tablet | Strip x2 = Rp 11.395 | 80 | 2026-11-25 |
| 8991000000386 | Vitamin B Kompleks | Vitamin & Suplemen | Rp 300 / Tablet | Strip x10 = Rp 3.000 | 400 | 2027-01-08 |
| 8991000000393 | Zinc 20 mg Dispersible | Vitamin & Suplemen | Rp 1.500 / Tablet | Strip x10 = Rp 15.000 | 150 | 2027-03-02 |
