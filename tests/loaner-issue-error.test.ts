import { describe, expect, it } from 'vitest';
import { getLoanerIssueError } from '../src/utils/loanerIssueError';

describe('loaner issue error feedback', () => {
  const messages = [
    'customer.dob should not be empty',
    'customer.dob must be a string',
    'customer.licenceExpiry should not be empty',
    'customer.licenceExpiry must be a string',
    'vehicle.vin should not be empty',
    'vehicle.vin must be a string',
  ];

  it('turns the reported API response into one instruction per field', () => {
    const feedback = getLoanerIssueError({ statusCode: 400, data: { message: messages } });
    expect(feedback.title).toBe('Please check these details');
    expect(feedback.message).toBe(
      'Please complete or correct the following before issuing the vehicle:\n\n' +
      '\u2022 Customer birth year (Section 1)\n' +
      '\u2022 Driver licence expiry date (Section 1)\n' +
      '\u2022 Vehicle VIN (Section 2)',
    );
    expect(feedback.sections).toEqual([1, 2]);
  });

  it('also handles errors flattened by the API client', () => {
    expect(getLoanerIssueError(new Error(messages.join(', '))).sections).toEqual([1, 2]);
  });

  it('keeps unknown validation and server internals out of the dialog', () => {
    for (const statusCode of [400, 422, 500]) {
      const feedback = getLoanerIssueError({ statusCode, message: 'internal.secret must be a string' });
      expect(feedback.message).not.toContain('internal.secret');
      expect(feedback.message).not.toContain('must be a string');
      expect(feedback.sections).toEqual([]);
    }
    expect(getLoanerIssueError(null).title).toBe('Unable to issue vehicle');
  });

  it('gives recovery instructions for connection and permission errors', () => {
    expect(getLoanerIssueError(new Error('Failed to fetch')).message).toContain('check your connection and the loaner list');
    expect(getLoanerIssueError({ statusCode: 401 }).message).toContain('sign in again');
    expect(getLoanerIssueError({ statusCode: 403 }).message).toContain('permission');
    expect(getLoanerIssueError({ statusCode: 409 }).message).toContain('availability');
  });
});
