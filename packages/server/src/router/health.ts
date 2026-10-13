import Router from '@koa/router';
import { getHealth } from '../controller/healthController';

export const healthRouter = new Router();

healthRouter.get('/health', getHealth);
