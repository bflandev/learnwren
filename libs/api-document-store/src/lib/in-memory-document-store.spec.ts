import { describeDocumentStoreContract } from '../testing/document-store.contract';
import { DocumentNotFoundError } from './document-store.errors';
import { compareFieldValues, createInMemoryDocumentStore } from './in-memory-document-store';

describeDocumentStoreContract('in-memory', () => createInMemoryDocumentStore());

describe('compareFieldValues', () => {
  it('returns -1/0/1 for less-than/equal/greater-than, independent of sort-algorithm quirks', () => {
    expect(compareFieldValues(1, 2)).toBe(-1);
    expect(compareFieldValues(2, 1)).toBe(1);
    expect(compareFieldValues(2, 2)).toBe(0);
    expect(compareFieldValues('a', 'b')).toBe(-1);
    expect(compareFieldValues('b', 'a')).toBe(1);
    expect(compareFieldValues('a', 'a')).toBe(0);
  });
});

describe('createInMemoryDocumentStore', () => {
  it('seeds documents by full path and exposes them on __store', async () => {
    const store = createInMemoryDocumentStore({ 'courses/c1/modules/m1': { title: 'M' } });
    const snap = await store.collection('courses').doc('c1').collection('modules').doc('m1').get();
    expect(snap.data()).toEqual({ title: 'M' });
    expect(store.__store.get('courses/c1/modules/m1')).toEqual({ title: 'M' });
  });

  it('copies on read and write so callers cannot mutate stored data', async () => {
    const data = { list: [1] };
    const store = createInMemoryDocumentStore();
    const ref = store.collection('c').doc('a');
    await ref.set(data);
    data.list.push(2);
    const read = (await ref.get()).data() as { list: number[] };
    read.list.push(3);
    expect((await ref.get()).data()).toEqual({ list: [1] });
  });

  it('generates sequential auto ids', () => {
    const store = createInMemoryDocumentStore();
    expect(store.collection('c').doc().id).toBe('auto-1');
    expect(store.collection('c').doc().id).toBe('auto-2');
  });

  it('a failing batch applies nothing', async () => {
    const store = createInMemoryDocumentStore({ 'c/a': { v: 1 } });
    const batch = store.batch();
    batch.set(store.collection('c').doc('a'), { v: 2 });
    batch.update(store.collection('c').doc('missing'), { v: 3 });
    await expect(batch.commit()).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(store.__store.get('c/a')).toEqual({ v: 1 });
  });

  it('a transaction update on a missing document rejects and applies nothing', async () => {
    const store = createInMemoryDocumentStore({ 'c/a': { v: 1 } });
    await expect(
      store.runTransaction(async (txn) => {
        txn.set(store.collection('c').doc('a'), { v: 2 });
        txn.update(store.collection('c').doc('missing'), { v: 3 });
      }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(store.__store.get('c/a')).toEqual({ v: 1 });
  });

  it('rejects an unsupported where operator instead of ignoring it', async () => {
    const store = createInMemoryDocumentStore({ 'c/a': { v: 1 } });
    // Cast: the port's types forbid it, but a mutated or untyped caller must not get silent results.
    const q = store.collection('c').where('v', '>' as '==', 0);
    await expect(q.get()).rejects.toThrow("Unsupported where operator '>'");
  });
});
