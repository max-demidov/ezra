import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

test('Make sure secrets are available', async () => {
  expect(process.env.MEMBER_A_EMAIL).toBeTruthy();
  expect(process.env.MEMBER_A_PASSWORD).toBeTruthy();
  expect(process.env.MEMBER_B_EMAIL).toBeTruthy();
  expect(process.env.MEMBER_B_PASSWORD).toBeTruthy();
  expect(process.env.KRAKOVSKY_EMAIL).toBeTruthy();
  expect(process.env.KRAKOVSKY_PASSWORD).toBeTruthy();
});