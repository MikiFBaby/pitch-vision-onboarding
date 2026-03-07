// Test scheduleNameKeys matching for all audit cases

function stripPunct(s) { return s.replace(/['\u2019\u2018.,`]/g, '').trim(); }
function collapseLetters(s) { return s.replace(/[^a-z]/g, ''); }
function stripSuffix(s) { return s.replace(/\b(jr\.?|sr\.?|ii|iii|iv)\s*$/i, '').trim(); }

function scheduleNameKeys(firstName, lastName) {
    const f = (firstName || '').trim().toLowerCase();
    const l = (lastName || '').trim().toLowerCase();
    if (!f && !l) return [];
    const keys = new Set();
    keys.add(`${f}|${l}`);
    keys.add(`${stripPunct(f)}|${stripPunct(l)}`);
    keys.add(`${collapseLetters(f)}|${collapseLetters(l)}`);
    const fParts = f.split(/\s+/).filter(Boolean);
    if (fParts.length > 1) { keys.add(`${fParts[0]}|${l}`); keys.add(`${stripPunct(fParts[0])}|${stripPunct(l)}`); }
    if (!l && fParts.length >= 2) { const lw = fParts[fParts.length-1]; keys.add(`${fParts[0]}|${lw}`); keys.add(`${stripPunct(fParts[0])}|${stripPunct(lw)}`); }
    const lParts = l.split(/[\s-]+/).filter(p => p.length > 1);
    const lPartsAll = l.split(/[\s-]+/).filter(Boolean);
    if (lParts.length > 1) { const fk = fParts[0]||f; for (const part of lParts) { keys.add(`${fk}|${part}`); keys.add(`${stripPunct(fk)}|${stripPunct(part)}`); } }
    if (lParts.length > 1) { const fk = fParts[0]||f; const lw = lParts[lParts.length-1]; const st = stripSuffix(lw); if (st.length>1) { keys.add(`${fk}|${st}`); keys.add(`${stripPunct(fk)}|${stripPunct(st)}`); } if (lParts.length>2) { const sl = stripSuffix(lParts[lParts.length-2]); if (sl.length>1) keys.add(`${fk}|${sl}`); } }
    const lStr = stripSuffix(l); if (lStr!==l && lStr.length>1) { const fk=fParts[0]||f; keys.add(`${fk}|${lStr}`); keys.add(`${stripPunct(fk)}|${stripPunct(lStr)}`); const lsp=lStr.split(/\s+/).filter(p=>p.length>1); if(lsp.length>1) keys.add(`${fk}|${lsp[lsp.length-1]}`); }
    if (lPartsAll.length>=2 && lPartsAll[0].length===1) { const fk=fParts[0]||f; const wi=lPartsAll.slice(1).join(' '); keys.add(`${fk}|${wi}`); keys.add(`${fk}|${stripSuffix(wi)}`); }
    if (lPartsAll.length>=2) { const fk=fParts[0]||f; const cf=`${fk} ${lPartsAll[0]}`; const rl=lPartsAll.slice(1).join(' '); const sl2=stripSuffix(rl); keys.add(`${cf}|${sl2}`); keys.add(`${cf.replace(/\s+/g,'-')}|${sl2}`); keys.add(`${cf.replace(/\s+/g,'')}|${sl2}`); }
    if (f&&l) { keys.add(`${l}|${f}`); keys.add(`${stripPunct(l)}|${stripPunct(f)}`); if (fParts.length>1) keys.add(`${l}|${fParts[0]}`); }
    const fKey = fParts[0]||f;
    if (l.endsWith('s')&&l.length>3) keys.add(`${fKey}|${l.slice(0,-1)}`);
    else if (l.length>2) keys.add(`${fKey}|${l}s`);
    if (f.includes('-')||f.includes(' ')) { const n=f.replace(/[-\s]+/g,'-'); const s2=f.replace(/[-\s]+/g,' '); const c=f.replace(/[-\s]+/g,''); keys.add(`${n}|${l}`); keys.add(`${s2}|${l}`); keys.add(`${c}|${l}`); keys.add(`${stripPunct(n)}|${stripPunct(l)}`); keys.add(`${stripPunct(s2)}|${stripPunct(l)}`); }
    if (l.includes('.')) { const d=l.replace(/\./g,' ').replace(/\s+/g,' ').trim(); keys.add(`${fKey}|${d}`); keys.add(`${fKey}|${d.replace(/\s+/g,'')}`); }
    return [...keys].filter(k => k !== '|');
}

function keysOverlap(a, b) {
    const setA = new Set(a);
    return b.some(k => setA.has(k));
}

const testCases = [
    ['Amanda', 'Rose Hoang', 'Amanda', 'Hoang', 'Middle name in last_name'],
    ['John', 'C Whitney', 'John', 'Whitney', 'Middle initial in last_name'],
    ['Luis', 'A Nieves Jr', 'Luis', 'Nieves', 'Initial + suffix in last_name'],
    ['Abdulkarim', 'Alkhaldi', 'Abdulkarim', 'Al-Khaldi', 'Hyphen variation'],
    ['Christian', "O'Connor", 'Christian', 'O`Connor', 'Apostrophe vs backtick'],
    ['Tylo', 'Su Hackeett', 'Tylo', 'Su-Hackeett', 'Space vs hyphen in last'],
    ['Davidson', 'Elie', 'Elie', 'Davidson', 'Name swap'],
    ["Jurnee'", 'Cason', 'Jurnee', 'Cason', 'Trailing apostrophe'],
    ['Alyssa', 'St.Louis', 'Alyssa', 'St Louis', 'Period in last name'],
    ['Brian', 'Johnson-Lennord', 'Brian', 'Lennord', 'Hyphenated last name'],
    ['Alexus', 'McCully-Couture', 'Alexus', 'McCully', 'Hyphenated last name part 1'],
    ['Kristina', 'Buchanan-Collington', 'Kristina', 'Collington', 'Hyphenated last name part 2'],
    ['Tanisha', 'Elizabeth Ania King', 'Tanisha', 'King', 'Multiple middle names in last'],
    ['Maryah', 'Lee Capri', 'Maryah', 'Capri', 'Middle name in last_name'],
    ['Stacy', 'Martin Sprowl', 'Stacy', 'Sprowl', 'Middle name in last_name'],
    ['Stacy', 'Oliveira Jardim', 'Stacy', 'Jardim', 'Middle name in last_name'],
    ['Mir', 'Zariful Karim', 'Mir-Zariful', 'Karim', 'First name hyphenation'],
    ['Lisa-Ann', 'Lefebvre', 'Lisa- ann', 'Lefebvre', 'Hyphen spacing in first'],
    ['Jodi-Ann', 'Pettigrue', 'Jodi- ann', 'Pettigrue', 'Hyphen spacing in first'],
    ['Rose', 'Anne Miller', 'Rose', 'Miller', 'Middle name in last_name'],
    ["De'Andria", 'Clark', 'De`Andria', 'Clark', 'Apostrophe vs backtick'],
    ['Ester', 'Rebecca Cridlin', 'Ester', 'Cridlin', 'Middle name in last'],
    ['Faiaz', 'Sababa Saeed', 'Faiaz', 'Saeed', 'Middle name in last'],
    ['Joel', 'Desmond Hudgson', 'joel', 'Hudgson', 'Middle name + case'],
    ['Michael', 'Woodrow Walton', 'Michael', 'Walton', 'Middle name in last'],
    ['Sidi', 'Mohamed Sillah', 'Sidi', 'Sillah', 'Middle name in last'],
    ['Shaquawn', 'Valentino Huyler', 'Shaquawn', 'Huyler', 'Middle name in last'],
    ['Leban', 'Yussuf Xadi', 'Leban', 'Xadi', 'Middle name in last'],
    ['Amy', 'Angela Alfonso', 'Amy', 'Alfonso', 'Middle name in last'],
    ['Brian', 'Chiun Shin', 'Brian', 'Shin', 'Middle name in last'],
    ['Jessica', 'Royanne Thompson', 'Jessica', 'Thompson', 'Middle name in last'],
    ['Connor', 'Rickabus', 'Conner', 'Rickabus', 'Spelling variant (o/e) — expected FAIL'],
    ['Nkemdilim', 'Okeke', 'Kemdy', 'Okeke', 'Nickname — expected FAIL'],
    ['Alex', 'Rodney', 'Alexander', 'Rodney', 'Short name — expected FAIL'],
    ['Kish', 'Davidson', 'Kishann', 'Davidson', 'Short name — expected FAIL'],
    ['Waasiq', 'Bhutta', 'Waasiq', 'Bhuttu', 'Typo — expected FAIL'],
    ['Patrick', 'Dobson', 'Patrick', 'Dobman', 'Typo — expected FAIL'],
    ['Shelly', 'Blair', 'Shelley', 'blair', 'Spelling — expected FAIL'],
    ['Ronisha', 'Yates', 'Ronisa', 'Yates', 'Spelling — expected FAIL'],
    ['Tayshawn', 'Bryce', 'Tayshawna', 'Bryce', 'Spelling — expected FAIL'],
    ['Lerric', 'Boyd', 'Leeric', 'Boyd', 'Spelling — expected FAIL'],
    ['Victoria', 'Bedford', 'Victotia', 'Bedford', 'Typo — expected FAIL'],
    ['Brea', 'Ferreira', 'Breana', 'Ferreira', 'Short name — expected FAIL'],
];

let passed = 0, failed = 0;
const fails = [];
for (const [df, dl, sf, sl, desc] of testCases) {
    const dirKeys = scheduleNameKeys(df, dl);
    const schedKeys = scheduleNameKeys(sf, sl);
    const match = keysOverlap(dirKeys, schedKeys);
    if (match) { passed++; }
    else { failed++; fails.push(desc); }
}
console.log(`Results: ${passed}/${passed+failed} passed`);
if (fails.length > 0) {
    console.log(`\nFailed (${fails.length}):`);
    fails.forEach(f => console.log(`  - ${f}`));
}
