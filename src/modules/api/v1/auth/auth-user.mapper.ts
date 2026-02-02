import { User } from 'src/database/interfaces';

export const authUserFromUser = (user: User) => ({
  id: user.id,
  displayName: user.display_name,
});
