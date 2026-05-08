// puroks.js
// Map of barangay -> purok/sitio array
// Edit the arrays to hold the real Purok/Sitio names for each barangay.

const PUROKS = {
  "Bagong Kalsada": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],
  "Banadero": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],
  "Banlic": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7"],
  "Barandal": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],
  "Batino": ["Buli East","Buli West","Proper","Riverside"],
  "Bubuyan": ["Bubuyan"],
  "Bucal": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],
  "Bunggo": ["Purok 1","Purok 2","Purok 3"],
  "Burol": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],
  "Camaligan": ["Camaligan"],

   // Canlubang: official page lists 21 sitios/purok (explicit names).
  "Canlubang": [
    "Asia I","Asia II","Balagbag Araw/Kapatagan","Buntog","Canlubang","Carmel","Casmicehos",
    "Ceris I","Ceris II","Ceris III","Happy Valley","Kapatagan B-1","Locomotive","Majada-In",
    "Mangumit I","Mangumit II","Manphil","MCDC","Old Stable","Palaw","Putol"
  ],

  "Halang": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7"],
  "Hornalan": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5"],
  "Kay-Anlog": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],
  "La Mesa": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7","Purok 8"],
  "Laguerta": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],
  "Lawa": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5"],
  "Lingga": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],
  "Looc": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7"],
  "Mabato": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5"],

  // Majada In / Out (site lists Majada-Labas / Majada-In details)
  "Majada In": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7","Purok 8"],
  // Majada Out (Majada-Labas on the city site) -> 7 puroks
  "Majada Out": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7"],

  // Makiling from city page: 5 puroks
  "Makiling": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5"],

  // Mapagong: 4 puroks
  "Mapagong": ["Purok 1","Purok 2","Purok 3","Purok 4"],

  // Masili: 6 puroks
  "Masili": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],

  // Maunong: 8 puroks
  "Maunong": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7","Purok 8"],

  // Mayapa: official page lists "Mayapa Proper Purok 1-6" and "EM's Bo. CVL Purok 1-6"
  "Mayapa": [
    "Mayapa Proper Purok 1","Mayapa Proper Purok 2","Mayapa Proper Purok 3",
    "Mayapa Proper Purok 4","Mayapa Proper Purok 5","Mayapa Proper Purok 6",
    "EM's Bo. CVL Purok 1","EM's Bo. CVL Purok 2","EM's Bo. CVL Purok 3",
    "EM's Bo. CVL Purok 4","EM's Bo. CVL Purok 5","EM's Bo. CVL Purok 6"
  ],

  // Milagrosa: 6 puroks
  "Milagrosa": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],

  // Palo-Alto: explicit sitio names on the city page
  "Palo-Alto": ["Highland One","Highland Two","Kaskuhan","Manggahan","Palo-Alto"],

  // Paciano Rizal: explicit list (14 entries) per city page
  "Paciano Rizal": [
    "Centerville","Checkpoint","Doña Felisa","Marivel Subd.","Modern Village","Morales/Villarisa",
    "Purok 5","Purok 6","Rizal Village","San Antonio","Sitio Ilaya","Sitio Maligaya","Sitio Riverside","St. Christopher I"
  ],

  // Palingon: 6 puroks
  "Palingon": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],

  // Pansol: 7 puroks
  "Pansol": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7"],

  // Parian: 7 puroks
  "Parian": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7"],

  // Prinza: 6 puroks
  "Prinza": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],

  // Punta: named sitios shown on the site
  "Punta": ["Guyabano","Langka","Lanzones","Manga","Rambutan","Santol"],

  // Puting Lupa: 6 puroks
  "Puting Lupa": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6"],

  // Real: 8 puroks
  "Real": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7","Purok 8"],

  // Saimsim: 7 puroks
  "Saimsim": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7"],

  // Sampiruhan: 7 puroks
  "Sampiruhan": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7"],

  // San Cristobal: city page lists "Brgy Proper" plus numbered puroks
  "San Cristobal": ["Brgy. Proper","Purok 1","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7"],

  // San Jose: named sitios/subdivisions
  "San Jose": ["Alberto","Cailles","Jenel Subd.","L.E. Subd.","Laureola","San Jose (Proper)"],

  // San Juan: explicit names
  "San Juan": ["Bagong Anyo","Bagong Diwa","Bagong Silang","San Juan (Proper)"],

  // Sirang Lupa: explicit small list
  "Sirang Lupa": ["Major Homes","Sirang Lupa","Tibagan"],

  // Sucol: 5 puroks
  "Sucol": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5"],

  // Turbina: 5 puroks
  "Turbina": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5"],

  // Ulango: 5 puroks
  "Ulango": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5"],

  // Uwisan: single "Brgy Proper"
  "Uwisan": ["Brgy. Proper"],

  // Lecheria: named sitios on the city page
  "Lecheria": ["Barerra","Dennis I","Dennis II","Hillside Subd.","Kanluran","Ronggot","Silangan","Watawat"],

  // Poblacion barangays: use official sitio/purok names from the city barangay profiles where available.
  "Barangay 1 (Poblacion)": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7","Purok 8"],
  "Barangay 2 (Poblacion)": ["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7","Purok 8"],
  "Barangay 3 (Poblacion)": ["Burgos","Chipeco","D.N.E.","Elasigue I","Elasigue II","Elepano I","Elepano II","Kinsville","Lazaro","Leonor I","Leonor II","Pabalan"],
  "Barangay 4 (Poblacion)": ["Callejon","Pasilyo","Villa Zenaida Subd."],
  "Barangay 5 (Poblacion)": ["Bandola Subd.","Burgos St.","Dennis I","Dennis II","Gen. Luna","L.E. II Subdivision","Lazer Comp.","Mabini St.","Market Site","Villa Silangan"],
  "Barangay 6 (Poblacion)": ["Calles","Casanas","Elepano","Lopez J.","Mercado","Sitio Labar"],
  "Barangay 7 (Poblacion)": ["Belarmino","Borja","Burgos St.","Juliano","Ma. Soledad"]
};

// For convenience, if the page loaded before puroks.js was used, try a safe initialization
if(typeof window !== 'undefined') {
  window.PUROKS = PUROKS;
}
