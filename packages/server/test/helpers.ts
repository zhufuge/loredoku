import supertest from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();
export const api = supertest(app.callback());
