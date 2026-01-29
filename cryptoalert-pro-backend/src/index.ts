import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(Number(env.PORT), () => {
  logger.info('Server started', { port: env.PORT });
});
