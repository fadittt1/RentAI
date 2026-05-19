#!/usr/bin/env node
/**
 * promote-user.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Promote a user to host + admin + verified.
 * Useful right before a demo when the seeded "user1" account is missing roles.
 *
 * Usage:
 *   node scripts/promote-user.mjs user1@example.com
 *   node scripts/promote-user.mjs +21620100001  (works with phone too)
 *
 * What it does:
 *   - Sets isHost = true
 *   - Sets verifiedEmail = true (if user has an email)
 *   - Sets verifiedPhone = true (if user has a phone)
 *   - Adds "host" and "ADMIN" to roles if not present
 *
 * If the user does not exist, prints a helpful message and exits 1.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from '@prisma/client';

const identifier = process.argv[2];
if (!identifier) {
  console.error('Usage: node scripts/promote-user.mjs <email or phone>');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findFirst({
    where: identifier.includes('@')
      ? { email: identifier }
      : { phone: identifier },
  });

  if (!user) {
    console.error(`✗ No user found with ${identifier.includes('@') ? 'email' : 'phone'}=${identifier}`);
    console.error('  Tip: register them via POST /api/auth/register first, then re-run this script.');
    process.exit(1);
  }

  const existingRoles = new Set((user.roles ?? []).map((r) => r.toString()));
  existingRoles.add('user');
  existingRoles.add('host');
  existingRoles.add('ADMIN');

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      isHost: true,
      verifiedEmail: user.email ? true : user.verifiedEmail,
      verifiedPhone: user.phone ? true : user.verifiedPhone,
      roles: Array.from(existingRoles),
    },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      isHost: true,
      verifiedEmail: true,
      verifiedPhone: true,
      roles: true,
    },
  });

  console.log('✓ Promoted user:');
  console.log(`  id:            ${updated.id}`);
  console.log(`  name:          ${updated.name}`);
  console.log(`  email:         ${updated.email ?? '(none)'}`);
  console.log(`  phone:         ${updated.phone ?? '(none)'}`);
  console.log(`  isHost:        ${updated.isHost}`);
  console.log(`  verifiedEmail: ${updated.verifiedEmail}`);
  console.log(`  verifiedPhone: ${updated.verifiedPhone}`);
  console.log(`  roles:         [${updated.roles.join(', ')}]`);
} catch (err) {
  console.error('✗ Error:', err.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
