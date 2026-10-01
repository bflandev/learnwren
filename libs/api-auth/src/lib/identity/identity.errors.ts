/** The email already belongs to another account (createUser, change-email link). */
export class EmailInUseError extends Error {
  override readonly name = 'EmailInUseError';
  constructor() {
    super('Email already in use');
  }
}

/** An email-action token that is unknown, expired, already used or for another kind of action. */
export class EmailActionInvalidError extends Error {
  override readonly name = 'EmailActionInvalidError';
  constructor() {
    super('Email action token is invalid or expired');
  }
}
