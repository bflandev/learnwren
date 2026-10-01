/** The email already belongs to another account (createUser, change-email link). */
export class EmailInUseError extends Error {
  override readonly name = 'EmailInUseError';
  constructor() {
    super('Email already in use');
  }
}
