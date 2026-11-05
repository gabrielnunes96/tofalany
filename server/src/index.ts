import { construirApp } from './app.js';
import { lerConfig } from './config.js';

const config = lerConfig();
const app = await construirApp(config);
await app.listen({ port: config.porta, host: config.host });
