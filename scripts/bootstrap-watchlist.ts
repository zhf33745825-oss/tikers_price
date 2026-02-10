import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { runBootstrapWatchlistScript } from "../src/lib/stock/bootstrap";

async function main() {
  await runBootstrapWatchlistScript();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("bootstrap watchlist failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
