import { app } from './app.js';
import { config } from './config/index.js';
import { prisma } from './database/index.js';

const server = app.listen(config.port, () => {
  console.log(`🚀 LabourSetu API server listening on http://localhost:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received. Closing HTTP server and database connections...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Server and database shut down gracefully.');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});
