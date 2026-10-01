import { publicUrl } from './public-url';

describe('publicUrl', () => {
  const saved = process.env['LEARNWREN_PUBLIC_URL'];
  afterEach(() => {
    if (saved === undefined) delete process.env['LEARNWREN_PUBLIC_URL'];
    else process.env['LEARNWREN_PUBLIC_URL'] = saved;
  });

  it('prefixes LEARNWREN_PUBLIC_URL', () => {
    process.env['LEARNWREN_PUBLIC_URL'] = 'https://learnwren.com';
    expect(publicUrl('/login?reset=ok')).toBe('https://learnwren.com/login?reset=ok');
  });

  it('defaults to the local dev web origin', () => {
    delete process.env['LEARNWREN_PUBLIC_URL'];
    expect(publicUrl('/login')).toBe('http://localhost:4200/login');
  });
});
