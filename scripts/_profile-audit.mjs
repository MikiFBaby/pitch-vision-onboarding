import { createClient } from '@supabase/supabase-js';

import { readFileSync } from 'fs';
import { resolve } from 'path';
const envText = readFileSync(resolve(import.meta.dirname, '../.env.local'), 'utf-8');
const env = {};
for (const l of envText.split('\n')) { const m = l.match(/^([A-Z_][A-Z_0-9]*)=["']?(.+?)["']?$/); if (m) env[m[1]] = m[2]; }

const client = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const run = async () => {
  // 1. All agents who slipped through (reset to false, no phone)
  const { data: reset } = await client.from('users')
    .select('first_name, last_name, email, phone, profile_completed, created_at')
    .eq('status', 'active')
    .eq('profile_completed', false)
    .is('phone', null)
    .not('email', 'eq', 'miki@pitchperfectsolutions.net');

  // 2. Check if any completed profiles still have no phone
  const { data: stillMissing } = await client.from('users')
    .select('first_name, last_name, email, phone, profile_completed, created_at')
    .eq('status', 'active')
    .eq('profile_completed', true)
    .is('phone', null)
    .not('email', 'eq', 'miki@pitchperfectsolutions.net');

  console.log('=== AGENTS WHO SLIPPED THROUGH (reset + emailed) ===');
  if (reset && reset.length) {
    reset.forEach((u, i) => console.log(`${i+1}. ${u.first_name} ${u.last_name} — ${u.email} — registered: ${u.created_at.substring(0,16)}`));
  } else {
    console.log('None found (all may have already re-completed)');
  }
  console.log(`Total: ${reset?.length || 0}`);

  console.log('');
  console.log('=== STILL COMPLETED WITH NO PHONE (should be 0) ===');
  if (stillMissing && stillMissing.length) {
    stillMissing.forEach(u => console.log(`  !! ${u.first_name} ${u.last_name} — ${u.email}`));
  } else {
    console.log('None — all caught');
  }

  // 3. All completed profiles
  const { data: all } = await client.from('users')
    .select('first_name, last_name, email, phone, nickname, bio, interests, avatar_url, role, profile_completed, created_at')
    .eq('profile_completed', true)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  const scored = (all || []).map(u => {
    let score = 0;
    if (u.nickname) score += 1;
    if (u.bio && u.bio.trim().length > 10) score += 2;
    const intCount = u.interests?.length || 0;
    score += Math.min(intCount, 5);
    const defaultAvatar = (u.avatar_url || '').includes('/images/avatar-');
    const slackAvatar = (u.avatar_url || '').includes('slack-edge');
    const gravatarAvatar = (u.avatar_url || '').includes('gravatar');
    const isCustomAvatar = u.avatar_url && !defaultAvatar && !slackAvatar && !gravatarAvatar;
    if (isCustomAvatar) score += 2;
    return { ...u, score, intCount, isCustomAvatar, slackAvatar, defaultAvatar };
  });

  const topProfiles = scored.filter(u => u.score >= 3).sort((a, b) => b.score - a.score);

  console.log('');
  console.log('=== TOP PROFILES (score >= 3) ===');
  topProfiles.forEach((u, i) => {
    console.log(`${i+1}. ${u.first_name} ${u.last_name} (score: ${u.score}, role: ${u.role})`);
    console.log(`   Nickname: ${u.nickname || '—'}`);
    const bioClean = u.bio ? u.bio.replace(/\n/g, ' ').substring(0, 120) + (u.bio.length > 120 ? '...' : '') : '—';
    console.log(`   Bio: ${bioClean}`);
    console.log(`   Interests (${u.intCount}): ${u.interests?.length ? u.interests.join(', ') : '—'}`);
    const avatarLabel = u.isCustomAvatar ? 'CUSTOM UPLOAD' : u.slackAvatar ? 'Slack photo' : 'Default';
    console.log(`   Avatar: ${avatarLabel}`);
    console.log('');
  });
  console.log(`Total standout profiles: ${topProfiles.length} / ${all?.length || 0} completed`);

  // Stats
  const total = scored.length;
  const withBio = scored.filter(u => u.bio && u.bio.trim().length > 10).length;
  const withNickname = scored.filter(u => u.nickname).length;
  const withInterests = scored.filter(u => u.interests?.length > 0).length;
  const withCustom = scored.filter(u => u.isCustomAvatar).length;
  const withSlack = scored.filter(u => u.slackAvatar).length;
  const minimal = scored.filter(u => u.score === 0).length;

  console.log('');
  console.log('=== COMPLETION QUALITY STATS ===');
  console.log(`Total completed profiles: ${total}`);
  console.log(`With bio: ${withBio} (${Math.round(withBio/total*100)}%)`);
  console.log(`With nickname: ${withNickname} (${Math.round(withNickname/total*100)}%)`);
  console.log(`With interests: ${withInterests} (${Math.round(withInterests/total*100)}%)`);
  console.log(`With custom avatar upload: ${withCustom} (${Math.round(withCustom/total*100)}%)`);
  console.log(`With Slack photo (auto): ${withSlack} (${Math.round(withSlack/total*100)}%)`);
  console.log(`Bare minimum only (name+phone): ${minimal} (${Math.round(minimal/total*100)}%)`);
};

run();
