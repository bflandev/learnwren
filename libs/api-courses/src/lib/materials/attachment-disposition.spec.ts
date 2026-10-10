import { describe, expect, it } from 'vitest';

import { attachmentDisposition } from './attachment-disposition';

const HEADER_SAFE = /^[\x20-\x7e]*$/;

describe('attachmentDisposition', () => {
  it('keeps a plain ASCII name as a simple quoted filename', () => {
    expect(attachmentDisposition('doc.pdf')).toBe('attachment; filename="doc.pdf"');
  });

  it.each([
    ['Week 1 – Notes.pdf', 'Week 1 _ Notes.pdf', 'Week%201%20%E2%80%93%20Notes.pdf'],
    ['Lecturer’s slides.pdf', 'Lecturer_s slides.pdf', 'Lecturer%E2%80%99s%20slides.pdf'],
    ['résumé.pdf', 'r_sum_.pdf', 'r%C3%A9sum%C3%A9.pdf'],
    ['講義.pdf', '__.pdf', '%E8%AC%9B%E7%BE%A9.pdf'],
  ])('encodes %j as an ASCII fallback plus RFC 5987 filename*', (name, fallback, encoded) => {
    const header = attachmentDisposition(name);
    expect(header).toBe(`attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`);
    // Node's setHeader throws ERR_INVALID_CHAR outside this range; that 500'd every download.
    expect(header).toMatch(HEADER_SAFE);
  });

  it('neutralises quote, backslash and line breaks (header injection)', () => {
    const header = attachmentDisposition('a"b\\c\r\nd.pdf');
    expect(header).toBe(`attachment; filename="a_b_c__d.pdf"; filename*=UTF-8''a%22b%5Cc%0D%0Ad.pdf`);
    expect(header).toMatch(HEADER_SAFE);
  });

  it("percent-encodes the RFC 5987 attr-char exceptions ' ( ) *", () => {
    expect(attachmentDisposition("it's (draft) *–.pdf")).toContain("filename*=UTF-8''it%27s%20%28draft%29%20%2A%E2%80%93.pdf");
  });

  it('survives a malformed name with a lone UTF-16 surrogate (encodeURIComponent would throw)', () => {
    const header = attachmentDisposition('bad\uD800name.pdf');
    expect(header).toBe(`attachment; filename="bad_name.pdf"; filename*=UTF-8''bad%EF%BF%BDname.pdf`);
  });
});
