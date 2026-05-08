// barangays.js
// Externalized barangay list used by add-record.html (and can be reused elsewhere).
// Edit this array to add/remove barangays.

const BARANGAYS = [
  "Bagong Kalsada","Banadero","Banlic","Barandal","Batino","Bubuyan","Bucal","Bunggo","Burol","Camaligan",
  "Canlubang","Halang","Hornalan","Kay-Anlog","La Mesa","Laguerta","Lawa","Lingga","Looc","Mabato",
  "Majada In","Majada Out","Makiling","Mapagong","Masili","Maunong","Mayapa","Milagrosa","Palo-Alto",
  "Paciano Rizal","Palingon","Pansol","Parian","Prinza","Punta","Puting Lupa","Real","Saimsim","Sampiruhan",
  "San Cristobal","San Jose","San Juan","Sirang Lupa","Sucol","Turbina","Ulango","Uwisan","Lecheria",
  "Barangay 1 (Poblacion)","Barangay 2 (Poblacion)","Barangay 3 (Poblacion)","Barangay 4 (Poblacion)",
  "Barangay 5 (Poblacion)","Barangay 6 (Poblacion)","Barangay 7 (Poblacion)"
];

// Provide a helper to populate a select element by id
function populateBarangaySelect(selectId) {
  const sel = document.getElementById(selectId);
  if(!sel) return;
  // remove existing non-placeholder options (keep first placeholder if present)
  while(sel.options.length > 1){
    sel.remove(1);
  }
  BARANGAYS.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

// For backwards compatibility if script loads after DOMContentLoaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  // try to populate common ids used by your pages
  populateBarangaySelect('barangay');
}