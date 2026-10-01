import { randomUUID } from 'node:crypto';

import { DocumentNotFoundError } from '../lib/document-store.errors';
import { DELETE_FIELD, DOCUMENT_ID, type DocumentStore } from '../lib/document-store.port';

/**
 * The behaviour every DocumentStore adapter must share (spec §5.1). Run it
 * once per adapter; a failure here means the backends have drifted.
 */
export function describeDocumentStoreContract(label: string, makeStore: () => DocumentStore): void {
  describe(`DocumentStore contract: ${label}`, () => {
    let store: DocumentStore;
    let ns: string;
    const col = (name: string) => store.collection(`${ns}_${name}`);

    beforeEach(() => {
      store = makeStore();
      ns = `t${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    });

    it('get returns what set wrote; a missing document does not exist', async () => {
      await col('items').doc('a').set({ n: 1, s: 'x', nested: { k: [1, 2] } });
      const hit = await col('items').doc('a').get();
      expect(hit.exists).toBe(true);
      expect(hit.id).toBe('a');
      expect(hit.ref.path).toBe(`${ns}_items/a`);
      expect(hit.data()).toEqual({ n: 1, s: 'x', nested: { k: [1, 2] } });
      const miss = await col('items').doc('zz').get();
      expect(miss.exists).toBe(false);
      expect(miss.data()).toBeUndefined();
    });

    it('set replaces the whole document', async () => {
      const ref = col('items').doc('a');
      await ref.set({ a: 1, b: 2 });
      await ref.set({ c: 3 });
      expect((await ref.get()).data()).toEqual({ c: 3 });
    });

    it('drops undefined properties on write', async () => {
      const ref = col('items').doc('a');
      await ref.set({ a: 1, b: undefined, c: { d: undefined, e: 2 } });
      expect((await ref.get()).data()).toEqual({ a: 1, c: { e: 2 } });
    });

    it('update merges top-level fields and DELETE_FIELD removes one', async () => {
      const ref = col('items').doc('a');
      await ref.set({ a: 1, b: 2, c: 3 });
      await ref.update({ b: 20, c: DELETE_FIELD, d: 4 });
      expect((await ref.get()).data()).toEqual({ a: 1, b: 20, d: 4 });
    });

    it('update on a missing document rejects with DocumentNotFoundError', async () => {
      await expect(col('items').doc('missing').update({ a: 1 })).rejects.toBeInstanceOf(
        DocumentNotFoundError,
      );
    });

    it('doc() with no id generates distinct ids', async () => {
      const a = col('items').doc();
      const b = col('items').doc();
      expect(a.id).not.toBe('');
      expect(a.id).not.toBe(b.id);
    });

    it('delete removes the document', async () => {
      const ref = col('items').doc('a');
      await ref.set({ a: 1 });
      await ref.delete();
      expect((await ref.get()).exists).toBe(false);
    });

    describe('queries', () => {
      beforeEach(async () => {
        await col('q').doc('a').set({ kind: 'x', rank: 3 });
        await col('q').doc('b').set({ kind: 'y', rank: 1 });
        await col('q').doc('c').set({ kind: 'x', rank: 2 });
      });

      it("where '==' filters", async () => {
        const snap = await col('q').where('kind', '==', 'x').get();
        expect(snap.docs.map((d) => d.id).sort()).toEqual(['a', 'c']);
        expect(snap.size).toBe(2);
        expect(snap.empty).toBe(false);
      });

      it("where 'in' filters", async () => {
        const snap = await col('q').where('rank', 'in', [1, 3]).get();
        expect(snap.docs.map((d) => d.id).sort()).toEqual(['a', 'b']);
      });

      it('DOCUMENT_ID works in where and orderBy', async () => {
        const byId = await col('q').where(DOCUMENT_ID, 'in', ['b', 'c']).get();
        expect(byId.docs.map((d) => d.id).sort()).toEqual(['b', 'c']);
        const ordered = await col('q').orderBy(DOCUMENT_ID).limit(2).get();
        expect(ordered.docs.map((d) => d.id)).toEqual(['a', 'b']);
      });

      it('orderBy asc/desc and limit', async () => {
        const asc = await col('q').orderBy('rank', 'asc').get();
        expect(asc.docs.map((d) => d.id)).toEqual(['b', 'c', 'a']);
        const desc = await col('q').orderBy('rank', 'desc').limit(2).get();
        expect(desc.docs.map((d) => d.id)).toEqual(['a', 'c']);
      });

      it('count() counts the collection and a filtered query', async () => {
        expect((await col('q').count().get()).data().count).toBe(3);
        expect((await col('q').where('kind', '==', 'x').count().get()).data().count).toBe(2);
      });

      it('an empty result is empty', async () => {
        const snap = await col('q').where('kind', '==', 'none').get();
        expect(snap.empty).toBe(true);
        expect(snap.size).toBe(0);
        expect(snap.docs).toEqual([]);
      });
    });

    it('a collection query excludes subcollection documents; collectionGroup spans parents', async () => {
      await col('parents').doc('p1').set({});
      await col('parents').doc('p1').collection(`${ns}_kids`).doc('k1').set({ tag: 't' });
      await col('parents').doc('p2').collection(`${ns}_kids`).doc('k2').set({ tag: 't' });
      expect((await col('parents').get()).docs.map((d) => d.id)).toEqual(['p1']);
      const group = await store.collectionGroup(`${ns}_kids`).where('tag', '==', 't').get();
      expect(group.docs.map((d) => d.ref.path).sort()).toEqual([
        `${ns}_parents/p1/${ns}_kids/k1`,
        `${ns}_parents/p2/${ns}_kids/k2`,
      ]);
    });

    it('recursiveDelete removes the document and its descendants, not its siblings', async () => {
      const p1 = col('tree').doc('p1');
      await p1.set({ a: 1 });
      await p1.collection('kids').doc('k').set({ b: 1 });
      await p1.collection('kids').doc('k').collection('grand').doc('g').set({ c: 1 });
      await col('tree').doc('p10').set({ sibling: true });
      await store.recursiveDelete(p1);
      expect((await p1.get()).exists).toBe(false);
      expect((await p1.collection('kids').doc('k').get()).exists).toBe(false);
      expect((await p1.collection('kids').doc('k').collection('grand').doc('g').get()).exists).toBe(false);
      expect((await col('tree').doc('p10').get()).exists).toBe(true);
    });

    it('a batch commits every write', async () => {
      await col('b').doc('u').set({ v: 1 });
      await col('b').doc('d').set({ v: 1 });
      const batch = store.batch();
      batch.set(col('b').doc('s'), { v: 2 });
      batch.update(col('b').doc('u'), { v: 3 });
      batch.delete(col('b').doc('d'));
      await batch.commit();
      expect((await col('b').doc('s').get()).data()).toEqual({ v: 2 });
      expect((await col('b').doc('u').get()).data()).toEqual({ v: 3 });
      expect((await col('b').doc('d').get()).exists).toBe(false);
    });

    describe('transactions', () => {
      it('reads documents and queries, then commits its writes and returns the body result', async () => {
        await col('t').doc('a').set({ n: 1, kind: 'k' });
        const result = await store.runTransaction(async (txn) => {
          const snap = await txn.get(col('t').doc('a'));
          const q = await txn.get(col('t').where('kind', '==', 'k'));
          txn.update(col('t').doc('a'), { n: (snap.data()?.['n'] as number) + 1 });
          txn.set(col('t').doc('b'), { n: q.size });
          return 'done';
        });
        expect(result).toBe('done');
        expect((await col('t').doc('a').get()).data()).toEqual({ n: 2, kind: 'k' });
        expect((await col('t').doc('b').get()).data()).toEqual({ n: 1 });
      });

      it('applies no write when the body throws, and rethrows the same error', async () => {
        await col('t').doc('a').set({ n: 1 });
        const boom = new Error('domain failure');
        await expect(
          store.runTransaction(async (txn) => {
            txn.set(col('t').doc('a'), { n: 99 });
            txn.delete(col('t').doc('a'));
            throw boom;
          }),
        ).rejects.toBe(boom);
        expect((await col('t').doc('a').get()).data()).toEqual({ n: 1 });
      });

      it('concurrent read-modify-write transactions lose no update', async () => {
        const ref = col('t').doc('counter');
        await ref.set({ n: 0 });
        await Promise.all(
          [1, 2, 3].map(() =>
            store.runTransaction(async (txn) => {
              const snap = await txn.get(ref);
              txn.update(ref, { n: (snap.data()?.['n'] as number) + 1 });
            }),
          ),
        );
        expect((await ref.get()).data()).toEqual({ n: 3 });
      });
    });
  });
}
