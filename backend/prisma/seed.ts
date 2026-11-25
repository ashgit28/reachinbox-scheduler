import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

async function main() {
  const ownerEmail = (process.env.SEED_USER_EMAIL ?? "dev@example.com").toLowerCase();
  const targetCount = Number(process.env.SEED_SENDER_COUNT ?? 2);

  // 1. Owner. googleId is a placeholder; the Google login handler (step 8) will
  //    find this row by email and replace it with the real Google id.
  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      googleId: `pending:${ownerEmail}`,
      email: ownerEmail,
      name: "Seed User",
    },
  });
  console.log(`User: ${user.email} (id=${user.id})`);

  // 2. Top up to targetCount senders (idempotent: re-running won't pile up accounts).
  const existing = await prisma.sender.count({ where: { userId: user.id } });
  const missing = Math.max(0, targetCount - existing);

  if (missing === 0) {
    console.log(`Already have ${existing} sender(s); nothing to create.`);
  }

  for (let i = 0; i < missing; i++) {
    // Calls Ethereal's API and returns a brand-new throwaway SMTP account.
    const account = await nodemailer.createTestAccount();

    const sender = await prisma.sender.create({
      data: {
        userId: user.id,
        fromEmail: account.user,
        displayName: `Ethereal Sender ${existing + i + 1}`,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpUser: account.user,
        smtpPass: account.pass,
      },
    });

    console.log(`Created sender ${sender.id}`);
    console.log(`  from : ${sender.fromEmail}`);
    console.log(`  smtp : ${sender.smtpHost}:${sender.smtpPort}`);
    console.log(`  inbox: log in at https://ethereal.email/login with ${account.user} / ${account.pass}`);
  }

  const total = await prisma.sender.count({ where: { userId: user.id } });
  console.log(`Done. ${user.email} now has ${total} sender(s).`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
