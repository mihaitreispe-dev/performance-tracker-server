export const splitName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/); // split by spaces (multiple allowed)

  if (parts.length === 0) {
    return { firstName: null, lastName: null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }; // only one word
  }

  const lastName = parts.pop(); // last element
  const firstName = parts.join(' '); // everything before
  return { firstName, lastName };
};
