import {
  DEFAULT_FIELD_ERROR_MESSAGES,
  firstErrorMessage,
} from './dynamic-field.model';

describe('firstErrorMessage', () => {
  it('returns null when there are no errors', () => {
    expect(firstErrorMessage(null)).toBeNull();
    expect(firstErrorMessage({})).toBeNull();
  });

  it('resolves the built-in message for the first error key', () => {
    expect(firstErrorMessage({ required: true })).toBe(
      'This field is required.',
    );
  });

  it('reads the error payload into bound-aware messages', () => {
    expect(firstErrorMessage({ min: { min: 5, actual: 2 } })).toBe(
      'Must be at least 5.',
    );
    expect(
      firstErrorMessage({ minlength: { requiredLength: 8, actualLength: 3 } }),
    ).toBe('Must be at least 8 characters.');
  });

  it('prefers a consumer override (string or factory) over the default', () => {
    expect(
      firstErrorMessage({ required: true }, { required: 'Required!' }),
    ).toBe('Required!');
    expect(
      firstErrorMessage(
        { max: { max: 10 } },
        { max: (e) => `<= ${(e as { max: number }).max}` },
      ),
    ).toBe('<= 10');
  });

  it('falls back to a generic message for an unknown validator key', () => {
    expect(firstErrorMessage({ weirdRule: true })).toBe(
      'This field is invalid.',
    );
  });

  it('resolves the email, maxlength and pattern built-in messages', () => {
    expect(firstErrorMessage({ email: true })).toBe(
      'Enter a valid email address.',
    );
    expect(
      firstErrorMessage({ maxlength: { requiredLength: 5, actualLength: 9 } }),
    ).toBe('Must be at most 5 characters.');
    expect(firstErrorMessage({ pattern: { requiredPattern: '\\d+' } })).toBe(
      'Invalid format.',
    );
  });

  it('exposes the common validators in the default map', () => {
    for (const key of [
      'required',
      'email',
      'min',
      'max',
      'minlength',
      'maxlength',
      'pattern',
    ]) {
      expect(DEFAULT_FIELD_ERROR_MESSAGES[key]).toBeDefined();
    }
  });

  it('reads the real bound out of the max payload', () => {
    expect(firstErrorMessage({ max: { max: 5, actual: 9 } })).toBe(
      'Must be at most 5.',
    );
  });

  it('degrades gracefully for a null error payload (no throw)', () => {
    expect(firstErrorMessage({ min: null })).toBe('Must be at least .');
  });

  it('returns empty string when error payload field is not a number', () => {
    // Tests the num() helper function's fallback when key is absent or non-numeric
    expect(firstErrorMessage({ min: { wrongKey: 5 } })).toBe(
      'Must be at least .',
    );
    expect(firstErrorMessage({ min: { min: 'not-a-number' } })).toBe(
      'Must be at least .',
    );
    expect(firstErrorMessage({ max: { max: null } })).toBe('Must be at most .');
    expect(firstErrorMessage({ minlength: {} })).toBe(
      'Must be at least  characters.',
    );
  });
});
