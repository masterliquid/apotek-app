// Sample catalogue for trying the app. Product names are common Indonesian pharmacy items.
// Prices marked [web] were taken from online pharmacy listings (K24Klik / Halodoc / Watsons, 2026); the rest are
// reasonable estimates [est]. Barcodes are generated sample EAN-13 codes (prefix 899) and are NOT the products' real barcodes.
// The drug-class categories are illustrative only, not a regulatory reference.

export const SAMPLE_PHARMACY = { code: "SAMPLE", name: "Apotek Contoh Sehat", address: "Jl. Contoh Raya No. 12, Jakarta", phone: "021-5550123" };

export const SAMPLE_SUPPLIERS = [
  { name: "PBF Mitra Medika Utama", phone: "021-5550101", address: "Jl. Industri No. 5, Jakarta" },
  { name: "PBF Karya Farma Nusantara", phone: "021-5550102", address: "Jl. Pemuda No. 21, Bekasi" },
  { name: "PBF Sehat Bersama", phone: "021-5550103", address: "Jl. Merdeka No. 8, Tangerang" },
  { name: "PBF Prima Distribusi Obat", phone: "021-5550104", address: "Jl. Raya Bogor Km 30, Depok" },
  { name: "CV Cahaya Alkes", phone: "021-5550105", address: "Jl. Kesehatan No. 3, Jakarta" },
];

// Fictional people.
export const SAMPLE_CUSTOMERS = [
  { name: "Budi Santoso", phone: "081200000001", address: "Jl. Melati 4" },
  { name: "Siti Aminah", phone: "081200000002", address: "Jl. Kenanga 12" },
  { name: "Rudi Hartono", phone: "081200000003", address: "Jl. Mawar 7" },
  { name: "Dewi Lestari", phone: "081200000004", address: "Jl. Anggrek 3" },
  { name: "Agus Wijaya", phone: "081200000005", address: "Jl. Dahlia 19" },
  { name: "Rina Marlina", phone: "081200000006", address: "Jl. Cempaka 5" },
  { name: "Haji Ahmad", phone: "081200000007", address: "Jl. Flamboyan 2" },
  { name: "Ibu Kartika", phone: "081200000008", address: "Jl. Teratai 9" },
];

export const EXTRA_CATEGORIES = ["Vitamin & Suplemen", "Alat Kesehatan", "Herbal & Jamu", "Bayi & Ibu", "Perawatan Luka"];
export const EXTRA_UNITS = ["Kapsul", "Sachet", "Tube", "Pcs", "Pak", "Pot"];

export type SampleProduct = {
  name: string;
  category: string;
  base: string; // smallest sold unit
  // Pack units: [unit, how many base units it holds]
  packs?: [string, number][];
  // Selling price of ONE `priceUnit` (base unit when omitted). Other prices follow from it.
  price: number;
  priceUnit?: string;
  supplier: number; // index into SAMPLE_SUPPLIERS
  stock: number; // total in base units
  expiry?: "soon"; // one batch expiring in a few weeks (shows the expiry alert)
  src: "web" | "est";
};

const OB = "Obat Bebas";
const OBT = "Obat Bebas Terbatas";
const OK = "Obat Keras";
const VIT = "Vitamin & Suplemen";
const ALK = "Alat Kesehatan";
const HERB = "Herbal & Jamu";
const BABY = "Bayi & Ibu";
const WOUND = "Perawatan Luka";
const COS = "Kosmetik";

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  // Pain, fever, cold (supplier 0)
  { name: "Paracetamol 500 mg", category: OB, base: "Tablet", packs: [["Strip", 10]], price: 3500, priceUnit: "Strip", supplier: 0, stock: 1000, src: "web" },
  { name: "Panadol Biru 500 mg", category: OB, base: "Tablet", packs: [["Strip", 10]], price: 14200, priceUnit: "Strip", supplier: 0, stock: 300, src: "web" },
  { name: "Bodrex Tablet", category: OB, base: "Tablet", packs: [["Strip", 10]], price: 5610, priceUnit: "Strip", supplier: 0, stock: 400, src: "web" },
  { name: "Bodrex Extra", category: OB, base: "Tablet", packs: [["Strip", 4]], price: 2903, priceUnit: "Strip", supplier: 0, stock: 240, src: "web" },
  { name: "Paramex Tablet", category: OB, base: "Tablet", packs: [["Strip", 4]], price: 3209, priceUnit: "Strip", supplier: 0, stock: 240, src: "web" },
  { name: "Paramex Nyeri Otot", category: OB, base: "Tablet", packs: [["Strip", 4]], price: 2450, priceUnit: "Strip", supplier: 0, stock: 200, src: "web" },
  { name: "Oskadon Tablet", category: OB, base: "Tablet", packs: [["Strip", 4]], price: 2600, priceUnit: "Strip", supplier: 0, stock: 200, src: "est" },
  { name: "Neozep F Tablet", category: OBT, base: "Tablet", packs: [["Strip", 4]], price: 3550, priceUnit: "Strip", supplier: 0, stock: 200, expiry: "soon", src: "web" },
  { name: "Decolgen Tablet", category: OBT, base: "Tablet", packs: [["Strip", 4]], price: 3000, priceUnit: "Strip", supplier: 0, stock: 200, src: "est" },
  { name: "Sanmol Tablet 500 mg", category: OB, base: "Tablet", packs: [["Strip", 10]], price: 7000, priceUnit: "Strip", supplier: 0, stock: 200, src: "est" },
  { name: "Ibuprofen 400 mg", category: OBT, base: "Tablet", packs: [["Strip", 10]], price: 5000, priceUnit: "Strip", supplier: 0, stock: 300, src: "est" },
  { name: "Asam Mefenamat 500 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 6000, priceUnit: "Strip", supplier: 0, stock: 300, src: "est" },
  // Stomach & cough (supplier 1)
  { name: "Promag Tablet", category: OB, base: "Tablet", packs: [["Strip", 10]], price: 8500, priceUnit: "Strip", supplier: 1, stock: 300, src: "est" },
  { name: "Mylanta Cair 50 ml", category: OB, base: "Botol", price: 20253, supplier: 1, stock: 24, src: "web" },
  { name: "Mylanta Cair 150 ml", category: OB, base: "Botol", price: 54406, supplier: 1, stock: 12, src: "web" },
  { name: "Antasida DOEN Tablet", category: OB, base: "Tablet", packs: [["Strip", 10]], price: 4000, priceUnit: "Strip", supplier: 1, stock: 400, src: "est" },
  { name: "Omeprazole 20 mg", category: OK, base: "Kapsul", packs: [["Strip", 10]], price: 15000, priceUnit: "Strip", supplier: 1, stock: 300, src: "est" },
  { name: "OBH Combi Batuk Flu Madu 60 ml", category: OBT, base: "Botol", price: 21356, supplier: 1, stock: 24, src: "web" },
  { name: "Komix Herbal Sachet", category: OBT, base: "Sachet", packs: [["Box", 12]], price: 21600, priceUnit: "Box", supplier: 1, stock: 120, src: "est" },
  { name: "Ambroxol 30 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 4000, priceUnit: "Strip", supplier: 1, stock: 300, src: "est" },
  { name: "Salbutamol 4 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 3000, priceUnit: "Strip", supplier: 1, stock: 200, src: "est" },
  { name: "Oralit Sachet", category: OB, base: "Sachet", price: 2000, supplier: 1, stock: 100, src: "est" },
  // Prescription generics (supplier 2)
  { name: "Amoxicillin 500 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 9000, priceUnit: "Strip", supplier: 2, stock: 500, src: "web" },
  { name: "Cefadroxil 500 mg", category: OK, base: "Kapsul", packs: [["Strip", 10]], price: 25000, priceUnit: "Strip", supplier: 2, stock: 200, src: "est" },
  { name: "Ciprofloxacin 500 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 18000, priceUnit: "Strip", supplier: 2, stock: 200, src: "est" },
  { name: "Amlodipine 10 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 10300, priceUnit: "Strip", supplier: 2, stock: 300, src: "web" },
  { name: "Amlodipine 5 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 5000, priceUnit: "Strip", supplier: 2, stock: 300, src: "est" },
  { name: "Captopril 25 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 4000, priceUnit: "Strip", supplier: 2, stock: 300, src: "est" },
  { name: "Metformin 500 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 4000, priceUnit: "Strip", supplier: 2, stock: 500, src: "est" },
  { name: "Simvastatin 20 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 12000, priceUnit: "Strip", supplier: 2, stock: 200, src: "est" },
  { name: "Dexamethasone 0,5 mg", category: OK, base: "Tablet", packs: [["Strip", 10]], price: 3000, priceUnit: "Strip", supplier: 2, stock: 300, src: "est" },
  { name: "Cetirizine 10 mg", category: OBT, base: "Tablet", packs: [["Strip", 10]], price: 7000, priceUnit: "Strip", supplier: 2, stock: 300, src: "est" },
  { name: "Loratadine 10 mg", category: OBT, base: "Tablet", packs: [["Strip", 10]], price: 9000, priceUnit: "Strip", supplier: 2, stock: 200, src: "est" },
  // Vitamins & herbal (supplier 3)
  { name: "Enervon-C", category: VIT, base: "Tablet", packs: [["Strip", 4], ["Botol", 30]], price: 5894, priceUnit: "Strip", supplier: 3, stock: 360, src: "web" },
  { name: "IPI Vitamin C 500 mg", category: VIT, base: "Tablet", packs: [["Botol", 45]], price: 7500, priceUnit: "Botol", supplier: 3, stock: 450, src: "web" },
  { name: "Redoxon Triple Action Effervescent", category: VIT, base: "Tablet", packs: [["Tube", 10]], price: 58300, priceUnit: "Tube", supplier: 3, stock: 50, src: "web" },
  { name: "Redoxon Zinc Effervescent Orange", category: VIT, base: "Tablet", packs: [["Strip", 2]], price: 11395, priceUnit: "Strip", supplier: 3, stock: 80, expiry: "soon", src: "web" },
  { name: "Vitamin B Kompleks", category: VIT, base: "Tablet", packs: [["Strip", 10]], price: 3000, priceUnit: "Strip", supplier: 3, stock: 400, src: "est" },
  { name: "Zinc 20 mg Dispersible", category: VIT, base: "Tablet", packs: [["Strip", 10]], price: 15000, priceUnit: "Strip", supplier: 3, stock: 150, src: "est" },
  { name: "Tolak Angin Cair 15 ml", category: HERB, base: "Sachet", packs: [["Box", 12]], price: 57157, priceUnit: "Box", supplier: 3, stock: 240, src: "web" },
  { name: "Antangin JRG Sachet", category: HERB, base: "Sachet", packs: [["Box", 12]], price: 33600, priceUnit: "Box", supplier: 3, stock: 120, src: "est" },
  { name: "Minyak Kayu Putih Cap Lang 60 ml", category: HERB, base: "Botol", price: 24000, supplier: 3, stock: 24, src: "est" },
  // First aid & devices (supplier 4)
  { name: "Betadine Sabun Cair 100 ml", category: WOUND, base: "Botol", price: 54766, supplier: 4, stock: 10, src: "web" },
  { name: "Betadine Antiseptic Solution 15 ml", category: WOUND, base: "Botol", price: 18000, supplier: 4, stock: 24, src: "est" },
  { name: "Hansaplast Plester Classic", category: WOUND, base: "Pcs", packs: [["Box", 10]], price: 4000, priceUnit: "Box", supplier: 4, stock: 100, src: "est" },
  { name: "Hansaplast Koyo Panas", category: WOUND, base: "Pcs", price: 11942, supplier: 4, stock: 40, src: "web" },
  { name: "Hansaplast Koyo Hangat Renceng", category: WOUND, base: "Pcs", price: 3124, supplier: 4, stock: 120, src: "web" },
  { name: "Counterpain Cool Gel 15 g", category: OB, base: "Tube", price: 32111, supplier: 4, stock: 12, src: "web" },
  { name: "Counterpain Cool Gel 30 g", category: OB, base: "Tube", price: 51403, supplier: 4, stock: 8, src: "web" },
  { name: "Alkohol 70% 100 ml", category: WOUND, base: "Botol", price: 8000, supplier: 4, stock: 30, src: "est" },
  { name: "Kapas Steril 100 g", category: WOUND, base: "Pcs", price: 12000, supplier: 4, stock: 20, src: "est" },
  { name: "Masker Medis 3 Ply", category: ALK, base: "Pcs", packs: [["Pak", 50]], price: 25000, priceUnit: "Pak", supplier: 4, stock: 500, src: "est" },
  { name: "Hand Sanitizer 60 ml", category: ALK, base: "Botol", price: 12000, supplier: 4, stock: 24, src: "est" },
  { name: "Termometer Digital", category: ALK, base: "Pcs", price: 35000, supplier: 4, stock: 10, src: "est" },
  { name: "Tensimeter Digital", category: ALK, base: "Pcs", price: 350000, supplier: 4, stock: 3, src: "est" },
  // Baby & personal care (supplier 4)
  { name: "Minyak Telon Lang 60 ml", category: BABY, base: "Botol", price: 22000, supplier: 4, stock: 24, src: "est" },
  { name: "Bedak Bayi 100 g", category: BABY, base: "Pot", price: 15000, supplier: 4, stock: 24, src: "est" },
  { name: "Vaseline Petroleum Jelly 50 g", category: COS, base: "Pot", price: 14000, supplier: 4, stock: 24, src: "est" },
];
