'use strict';
const fs = require('fs');
const path = require('path');

const H = 'HEAD', HI = 'सिर';
const rows = [];
const add = (re, rh, med, gr) => rows.push([H, HI, re, rh, med, gr]);

// PAIN, sudden - and go, suddenly
add('HEAD - PAIN, sudden - and go, suddenly','सिर - दर्द, अचानक - और जाना, अचानक','Bell',2);
add('HEAD - PAIN, sudden - and go, suddenly','सिर - दर्द, अचानक - और जाना, अचानक','merc-c',1);

// PAIN, sudden - decreasing gradually
[['Asaf',1],['calc-ac',1],['fl-ac',1],['puls',1],['ran-sc',1],['sabin',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - decreasing gradually','सिर - दर्द, अचानक - धीरे-धीरे कम होना',m,g));

// PAIN, sudden - during micturition
add('HEAD - PAIN, sudden - during micturition','सिर - दर्द, अचानक - पेशाब के दौरान','Tabac',1);

// PAIN, sudden - summer, in, agg.
[['Bell',3],['Carb-v',3],['Nat-c',3],['Puls',3],
 ['bry',2],['graph',2],['lyc',2],['nat-m',2],['thuj',2],
 ['Ant-c',1],['bar-c',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - summer, in, agg.','सिर - दर्द, अचानक - गर्मी में - बढ़ता है',m,g));

// PAIN, sudden - sun, from exposure to
[['Bry',3],['Glon',3],['Lach',3],['Nat-c',3],['Puls',3],
 ['Acon',2],['agar',2],['aloe',2],['Ant-c',2],['Cann-i',2],['carb-v',2],
 ['cocc',2],['euphr',2],['gels',2],['hyos',2],['ign',2],['nat-m',2],
 ['nux-v',2],['selen',2],['stram',2],['syph',2],['sulph',2],['ther',2],['zinc',2],
 ['act-sp',1],['bar-c',1],['bell',1],['brom',1],['bruc',1],['cadm',1],
 ['calc',1],['camph',1],['cast',1],['chin-s',1],['gent-l',1],['hipp',1],
 ['manc',1],['valer',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - sun, from exposure to','सिर - दर्द, अचानक - धूप के संपर्क में आने से',m,g));

// PAIN, sudden - amel. in
[['Graph',1],['stront',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - amel. in','सिर - दर्द, अचानक - घटता है, में',m,g));

// PAIN, sudden - in shade
add('HEAD - PAIN, sudden - in shade','सिर - दर्द, अचानक - छाया में','Brom',1);

// PAIN, sudden - supper amel. after
[['Am-c',1],['lach',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - supper amel. after','सिर - दर्द, अचानक - रात का खाना - बाद में घटता है',m,g));

// PAIN, sudden - suppuration, pain as if from
[['Ant-t',1],['bov',1],['bufo',1],['carb-v',1],['nux-v',1],['petr',1],['rhodo',1],['Stann',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - suppuration, pain as if from','सिर - दर्द, अचानक - दमन, दर्द मानो से हो',m,g));

// PAIN, sudden - swallowing, when
add('HEAD - PAIN, sudden - swallowing, when','सिर - दर्द, अचानक - निगलने पर','Mag-c',1);

// PAIN, sudden - syphilitic (COMPLETE - was split across HEAD+SWALLOWING)
[['Thuj',3],
 ['aur',2],['kali-i',2],['merc',2],['nit-ac',2],['syph',2],
 ['Asaf',1],['fl-ac',1],['hep',1],['led',1],['mez',1],['phyto',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - syphilitic','सिर - दर्द, अचानक - सिफिलिटिक',m,g));

// PAIN, sudden - talking, while, agg. (was in SWALLOWING)
[['Nat-m',3],
 ['Acon',1],['agar',1],['aran',1],['aur',1],['bry',1],['cact',1],
 ['calc',1],['canth',1],['chin',1],['cic',1],['cocc',1],['coff',1],
 ['con',1],['dros',1],['dulc',1],['euphr',1],['fl-ac',1],['glon',1],
 ['hyos',1],['ign',1],['iod',1],['lac-c',1],['led',1],['mag-m',1],
 ['merc',1],['mez',1],['nux-j',1],['nux-v',1],['par',1],['phos-ac',1],
 ['puls',1],['rhus-t',1],['sang',1],['sars',1],['sil',1],['spig',1],
 ['spong',1],['sulph',1],['zinc',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - talking, while, agg.','सिर - दर्द, अचानक - बोलते समय - बढ़ता है',m,g));

// PAIN, sudden - talking, while, amel. (was mislabeled as bare "amel.")
[['Eup-per',1],['ham',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - talking, while, amel.','सिर - दर्द, अचानक - बोलते समय - घटता है',m,g));

// PAIN, sudden - swallowing, when - distant
add('HEAD - PAIN, sudden - swallowing, when - distant','सिर - दर्द, अचानक - निगलने पर - दूर से','Mur-ac',1);

// PAIN, sudden - swallowing, when - others, of
[['Aran',1],['bar-c',1],['ign',1],['merc',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - swallowing, when - others, of','सिर - दर्द, अचानक - निगलने पर - दूसरों का',m,g));

// PAIN, sudden - swallowing, when - tea, from
[['Chin',1],['lach',1],['selen',1],['sep',1],['thuj',1],['verat',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - swallowing, when - tea, from','सिर - दर्द, अचानक - निगलने पर - चाय से',m,g));

// PAIN, sudden - swallowing, when - amel.
add('HEAD - PAIN, sudden - swallowing, when - amel.','सिर - दर्द, अचानक - निगलने पर - घटता है','Ferr-p',1);

// PAIN, sudden - swallowing, when - strong
[['Carb-ac',1],['glon',1]].forEach(([m,g])=>
  add('HEAD - PAIN, sudden - swallowing, when - strong','सिर - दर्द, अचानक - निगलने पर - तेज',m,g));

// PAIN, sudden - swallowing, when - teeth, on compressing the
add('HEAD - PAIN, sudden - swallowing, when - teeth, on compressing the','सिर - दर्द, अचानक - निगलने पर - दाँत दबाने पर','Ind',1);

// PAIN - temperature, from a change (added missing verb.)
[['Carb-v',1],['ran-b',1],['verb',1]].forEach(([m,g])=>
  add('HEAD - PAIN - temperature, from a change','सिर - दर्द - तापमान बदलने से',m,g));

// PAIN - thinking of pain agg.
[['Cham',2],['ferr-p',2],['ign',2],['sabad',2],
 ['chin',1],['hell',1],['helon',1],['nat-s',1],['pip-m',1],['sin-n',1],['staph',1]].forEach(([m,g])=>
  add('HEAD - PAIN - thinking of pain agg.','सिर - दर्द - दर्द के बारे में सोचने से - बढ़ता है',m,g));

// PAIN - amel. (after thinking of pain section)
[['Agar',1],['camph',1],['cic',1],['prun',1]].forEach(([m,g])=>
  add('HEAD - PAIN - amel.','सिर - दर्द - घटता है',m,g));

// PAIN - thunder-storms, air just before, agg. (fixed rhod→rhodo)
[['Bry',1],['lach',1],['nat-c',1],['phos',1],['rhodo',1],['sep',1],['sil',1]].forEach(([m,g])=>
  add('HEAD - PAIN - thunder-storms, air just before, agg.','सिर - दर्द - आंधी-तूफान से ठीक पहले - बढ़ता है',m,g));

// PAIN - during, agg.
add('HEAD - PAIN - during, agg.','सिर - दर्द - के दौरान - बढ़ता है','Nat-p',1);

// PAIN - tobacco, smoking, from
[['Acet-ac',1],['acon',1],['ant-c',1],['calad',1],['calc',1],['caust',1],
 ['clem',1],['cocc',1],['coc-c',1],['ferr',1],['ferr-i',1],['gels',1],
 ['glon',1],['ign',1],['mag-c',1],['nat-a',1],['nat-m',1],['nux-v',1],
 ['op',1],['par',1],['puls',1],['spig',1],['thuj',1]].forEach(([m,g])=>
  add('HEAD - PAIN - tobacco, smoking, from','सिर - दर्द - तम्बाकू धूम्रपान से',m,g));

// PAIN - tobacco, smoking, amel.
[['Am-c',1],['aran',1],['calc-p',1],['carb-ac',1],['naja',1]].forEach(([m,g])=>
  add('HEAD - PAIN - tobacco, smoking, amel.','सिर - दर्द - तम्बाकू धूम्रपान से - घटता है',m,g));

// PAIN - touch agg.
[['Carb-v',3],['Sil',3],['Sulph',3],
 ['Acon',1],['agar',1],['agn',1],['all-c',1],['alum',1],['arg-m',1],
 ['bar-c',1],['bell',1],['bor',1],['bov',1],['bry',1],['calc',1],
 ['camph',1],['casc',1],['cast',1],['carb-an',1],['chel',1],['chin',1],
 ['cinb',1],['con',1],['cupr',1],['daph',1],['grat',1],['ign',1],
 ['ip',1],['Kali-i',1],['Kali-c',1],['lact',1],['led',1],['lyc',1],
 ['lyssin',1],['mag-s',1],['merc',1],['mez',1],['mur-ac',1],['nat-n',1],
 ['nit-ac',1],['nux-m',1],['par',1],['puls',1],['spig',1],['Arn',1]].forEach(([m,g])=>
  add('HEAD - PAIN - touch agg.','सिर - दर्द - स्पर्श से - बढ़ता है',m,g));

// PAIN - touch agg. - on vertex, from (MISSING - added)
add('HEAD - PAIN - touch agg. - on vertex, from','सिर - दर्द - स्पर्श से - शीर्ष पर से','Sabin',1);

// PAIN - touch agg. - amel. (MISSING - added, 16 remedies)
[['Ars',1],['asaf',1],['bell',1],['bry',1],['calc',1],['coloc',1],
 ['con',1],['cycl',1],['kali-n',1],['mang',1],['meny',1],['mur-ac',1],
 ['phos',1],['sars',1],['thuj',1],['viol-t',1]].forEach(([m,g])=>
  add('HEAD - PAIN - touch agg. - amel.','सिर - दर्द - स्पर्श से - घटता है',m,g));

// PAIN - turning body, when (fixed: was missing "PAIN -" prefix)
[['Cham',1],['Glon',1],['Graph',1],['Lyc',1],['Merc-i-f',1],['Nat-m',1],['Plant',1],['Sil',1]].forEach(([m,g])=>
  add('HEAD - PAIN - turning body, when','सिर - दर्द - शरीर घुमाने पर',m,g));

// PAIN - in bed, when (fixed prefix)
add('HEAD - PAIN - in bed, when','सिर - दर्द - बिस्तर में, जब','Meph',1);

// PAIN - twilight agg. (fixed prefix)
[['Ang',1],['Caj',1],['Puls',1]].forEach(([m,g])=>
  add('HEAD - PAIN - twilight agg.','सिर - दर्द - गोधूलि में - बढ़ता है',m,g));

// PAIN - twilight amel. (fixed prefix, was "HEAD - amel.")
add('HEAD - PAIN - twilight amel.','सिर - दर्द - गोधूलि में - घटता है','Coca',1);

// PAIN - twitching (fixed grading: only Bell & Sulph are bold)
[['Bell',3],['Sulph',3],
 ['Arn',1],['bry',1],['carb-v',1],['chin',1],['ign',1],['kali-c',1],['lyc',1],['sil',1]].forEach(([m,g])=>
  add('HEAD - PAIN - twitching','सिर - दर्द - फड़कना',m,g));

// PAIN - 1 p.m. (MISSING - added)
add('HEAD - PAIN - 1 p.m.','सिर - दर्द - दोपहर 1 बजे','Mag-c',1);

// PAIN - stooping (fixed prefix)
add('HEAD - PAIN - stooping','सिर - दर्द - झुकने पर','Arn',1);

// PAIN - walking (fixed prefix)
add('HEAD - PAIN - walking','सिर - दर्द - चलने पर','Bell',1);

// Write TSV
const header = 'Chapter (English)\tChapter (Hindi)\tRubric (English)\tRubric (Hindi)\tMedicine\tGrading';
const lines = rows.map(r => r.join('\t'));
const out = [header, ...lines].join('\n');
const outPath = path.join(__dirname, '../data/page_156_complete.tsv');
fs.writeFileSync(outPath, out, 'utf8');
console.log(`✅ Written ${rows.length} rows to ${outPath}`);

// Quick summary
const rubrics = new Set(rows.map(r => r[2]));
console.log(`📊 Distinct rubrics: ${rubrics.size}`);
const g3 = rows.filter(r => r[5] === 3).length;
const g2 = rows.filter(r => r[5] === 2).length;
const g1 = rows.filter(r => r[5] === 1).length;
console.log(`   Grade 3: ${g3}, Grade 2: ${g2}, Grade 1: ${g1}`);
