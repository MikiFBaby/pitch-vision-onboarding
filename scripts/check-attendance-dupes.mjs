import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAll(table) {
  const allRows = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) { console.error(`${table} error:`, error); return []; }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return allRows;
}

async function checkDupes() {
  // === Attendance Events ===
  const ae = await fetchAll('Attendance Events');
  console.log(`=== Attendance Events: ${ae.length} total rows ===`);

  const aeMap = new Map();
  ae.forEach(row => {
    const key = `${(row['Agent Name'] || '').trim().toLowerCase()}|${row['Date'] || ''}|${(row['Event Type'] || '').toLowerCase()}`;
    const arr = aeMap.get(key) || [];
    arr.push(row);
    aeMap.set(key, arr);
  });

  let aeDupeCount = 0;
  let aeDupeRows = 0;
  const aeDupeIds = [];
  aeMap.forEach((rows, key) => {
    if (rows.length > 1) {
      aeDupeCount++;
      aeDupeRows += rows.length - 1;
      // Keep first, mark rest for deletion
      for (let i = 1; i < rows.length; i++) {
        aeDupeIds.push(rows[i].id);
      }
      console.log(`DUPE AE (${rows.length}x): ${key}`);
    }
  });
  console.log(`AE duplicate groups: ${aeDupeCount} (${aeDupeRows} extra rows to remove)\n`);

  // === Non Booked Days Off ===
  const nb = await fetchAll('Non Booked Days Off');
  console.log(`=== Non Booked Days Off: ${nb.length} total rows ===`);

  const nbMap = new Map();
  nb.forEach(row => {
    const key = `${(row['Agent Name'] || '').trim().toLowerCase()}|${row['Date'] || ''}`;
    const arr = nbMap.get(key) || [];
    arr.push(row);
    nbMap.set(key, arr);
  });

  let nbDupeCount = 0;
  let nbDupeRows = 0;
  const nbDupeIds = [];
  nbMap.forEach((rows, key) => {
    if (rows.length > 1) {
      nbDupeCount++;
      nbDupeRows += rows.length - 1;
      for (let i = 1; i < rows.length; i++) {
        nbDupeIds.push(rows[i].id);
      }
      console.log(`DUPE NB (${rows.length}x): ${key}`);
    }
  });
  console.log(`NB duplicate groups: ${nbDupeCount} (${nbDupeRows} extra rows to remove)\n`);

  // === Booked Days Off ===
  const bd = await fetchAll('Booked Days Off');
  console.log(`=== Booked Days Off: ${bd.length} total rows ===`);

  const bdMap = new Map();
  bd.forEach(row => {
    const key = `${(row['Agent Name'] || '').trim().toLowerCase()}|${row['Date'] || ''}`;
    const arr = bdMap.get(key) || [];
    arr.push(row);
    bdMap.set(key, arr);
  });

  let bdDupeCount = 0;
  let bdDupeRows = 0;
  const bdDupeIds = [];
  bdMap.forEach((rows, key) => {
    if (rows.length > 1) {
      bdDupeCount++;
      bdDupeRows += rows.length - 1;
      for (let i = 1; i < rows.length; i++) {
        bdDupeIds.push(rows[i].id);
      }
      console.log(`DUPE BD (${rows.length}x): ${key}`);
    }
  });
  console.log(`BD duplicate groups: ${bdDupeCount} (${bdDupeRows} extra rows to remove)\n`);

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Attendance Events: ${aeDupeRows} dupes to remove`);
  console.log(`Non Booked Days Off: ${nbDupeRows} dupes to remove`);
  console.log(`Booked Days Off: ${bdDupeRows} dupes to remove`);
  console.log(`Total: ${aeDupeRows + nbDupeRows + bdDupeRows} duplicate rows\n`);

  // Check if --delete flag passed
  if (process.argv.includes('--delete')) {
    console.log('=== DELETING DUPLICATES ===');

    // Delete AE dupes in batches of 100
    for (let i = 0; i < aeDupeIds.length; i += 100) {
      const batch = aeDupeIds.slice(i, i + 100);
      const { error } = await supabase
        .from('Attendance Events')
        .delete()
        .in('id', batch);
      if (error) console.error('AE delete error:', error);
      else console.log(`Deleted ${batch.length} AE dupes (batch ${Math.floor(i/100)+1})`);
    }

    for (let i = 0; i < nbDupeIds.length; i += 100) {
      const batch = nbDupeIds.slice(i, i + 100);
      const { error } = await supabase
        .from('Non Booked Days Off')
        .delete()
        .in('id', batch);
      if (error) console.error('NB delete error:', error);
      else console.log(`Deleted ${batch.length} NB dupes (batch ${Math.floor(i/100)+1})`);
    }

    for (let i = 0; i < bdDupeIds.length; i += 100) {
      const batch = bdDupeIds.slice(i, i + 100);
      const { error } = await supabase
        .from('Booked Days Off')
        .delete()
        .in('id', batch);
      if (error) console.error('BD delete error:', error);
      else console.log(`Deleted ${batch.length} BD dupes (batch ${Math.floor(i/100)+1})`);
    }

    console.log('\nDone. All duplicates removed.');
  } else {
    console.log('Run with --delete to remove duplicates');
  }
}

checkDupes().catch(console.error);
