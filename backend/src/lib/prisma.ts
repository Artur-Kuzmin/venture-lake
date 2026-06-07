import { PrismaClient } from '@prisma/client';

// Single shared Prisma client instance for the whole backend.
// Reuse this everywhere; do not instantiate PrismaClient elsewhere.
export const prisma = new PrismaClient();

export default prisma;
