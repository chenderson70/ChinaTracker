require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const prisma = new PrismaClient();
  const username = String(process.argv[2] || 'admin').trim().toLowerCase();
  const password = String(process.argv[3] || 'Password1111!!!!');

  if (!username || !password) {
    throw new Error('Usage: node scripts/reset-password.js <username> <newPassword>');
  }

  if (password.length < 8) {
    throw new Error('New password must be at least 8 characters.');
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    throw new Error(`User not found: ${username}`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  await prisma.authSession.updateMany({
    where: {
      userId: user.id,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  console.log(`Password reset for user: ${username}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error.message || error);
  process.exit(1);
});