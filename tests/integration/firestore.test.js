import { describe, it, expect, afterAll } from 'vitest';
import { db } from '../../src/config/firebase.js';

const ref = db.collection('smoke').doc('s02');

describe('Firestore through the Admin SDK', () => {
  afterAll(async () => {
    await ref.delete();
  });

  it('connects to the emulator, not a real project', () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  });

  it('writes and reads back one document', async () => {
    await ref.set({ hello: 'world', n: 1 });
    const snap = await ref.get();
    expect(snap.exists).toBe(true);
    expect(snap.data()).toEqual({ hello: 'world', n: 1 });
  });
});
